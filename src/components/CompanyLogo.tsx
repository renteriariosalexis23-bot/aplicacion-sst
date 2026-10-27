import React from "react";
import { useCompany } from "../CompanyContext";
import { resolveBrand } from "../utils/brand";

interface CompanyLogoProps {
  className?: string;
  alt?: string;
  variant?: "color" | "white";
}

export const CompanyLogo: React.FC<CompanyLogoProps> = ({
  className,
  alt,
  variant = "color",
}) => {
  const { selectedCompany } = useCompany();
  const brand = resolveBrand(selectedCompany);
  return (
    <img
      src={variant === "white" ? brand.logoWhite : brand.logo}
      alt={alt || selectedCompany?.businessName || "Gestión SST"}
      className={className}
      onError={(e) => {
        if (!e.currentTarget.src.endsWith("/logo.png")) e.currentTarget.src = "/logo.png";
      }}
    />
  );
};
