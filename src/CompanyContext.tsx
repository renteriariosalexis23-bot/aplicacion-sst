import React, { createContext, useContext, useEffect, useState } from "react";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { db } from "./firebase";
import { useAuth } from "./AuthContext";
import { Company } from "./types";
import { applyBrand, resolveBrand } from "./utils/brand";
import { setLetterheadCompany } from "./utils/pdfLetterhead";
import { isMainAdmin } from "./constants/admin";

interface CompanyContextType {
  companies: Company[];
  selectedCompany: Company | null;
  setSelectedCompanyRuc: (ruc: string) => void;
  loading: boolean;
}

const CompanyContext = createContext<CompanyContextType | undefined>(undefined);

export const CompanyProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { profile } = useAuth();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    applyBrand(resolveBrand(selectedCompany));
    setLetterheadCompany(selectedCompany);
  }, [selectedCompany]);

  useEffect(() => {
    if (!profile) {
      setCompanies([]);
      setSelectedCompany(null);
      setLoading(false);
      return;
    }

    setLoading(true);

    let q;
    if (
      isMainAdmin(profile.email) || profile.role === "super_admin" || profile.role === "employer" || profile.role === "gerencia"
    ) {
      // Default admin and super_admin can see all companies
      q = collection(db, "companies");
    } else if (profile.companyRuc) {
      // Employers and Workers only see their assigned company
      q = query(
        collection(db, "companies"),
        where("ruc", "==", profile.companyRuc),
      );
    } else {
      setCompanies([]);
      setSelectedCompany(null);
      setLoading(false);
      return;
    }

    let isUnsubscribed = false;
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const companiesData = snapshot.docs.map(
          (doc) => ({ id: doc.id, ...doc.data() }) as Company,
        );
        setCompanies(companiesData);

        // We only auto-select a company if none is legally selected or if the currently selected one vanished
        setSelectedCompany((prev) => {
          if (companiesData.length === 0) return null;

          // If we already have a selection, and it still exists in the new data, keep it.
          if (prev && companiesData.some((c) => c.ruc === prev.ruc)) {
            // We might still want to update the data of the selected company if its properties changed
            return companiesData.find((c) => c.ruc === prev.ruc) || prev;
          }

          // Otherwise auto select either what's on the profile or the first item
          const initialRuc = profile.companyRuc || companiesData[0].ruc;
          return (
            companiesData.find((c) => c.ruc === initialRuc) || companiesData[0]
          );
        });

        setLoading(false);
      },
      (error) => {
        console.error("Error fetching companies in context:", error);
        setLoading(false);
      },
    );

    return () => {
      if (!isUnsubscribed) {
        isUnsubscribed = true;
        try {
          unsubscribe();
        } catch (e) {}
      }
    };
  }, [profile]);

  const setSelectedCompanyRuc = (ruc: string) => {
    const company = companies.find((c) => c.ruc === ruc);
    if (company) {
      setSelectedCompany(company);
    }
  };

  return (
    <CompanyContext.Provider
      value={{ companies, selectedCompany, setSelectedCompanyRuc, loading }}
    >
      {children}
    </CompanyContext.Provider>
  );
};

export const useCompany = () => {
  const context = useContext(CompanyContext);
  if (context === undefined) {
    throw new Error("useCompany must be used within a CompanyProvider");
  }
  return context;
};
