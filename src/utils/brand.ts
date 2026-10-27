import { Company } from "../types";

export type CompanyKey = "ih" | "cc" | "pf";

export interface CompanyBrand {
  key: CompanyKey;
  logo: string;
  logoWhite: string;
  main: string;
  accent: string;
  deep: string;
  hue: number;
  // "gradient": logo blanco sobre el degradado; "panel": logo a color sobre un panel blanco con corte diagonal
  header: "gradient" | "panel";
  // Las ilustraciones son moradas; este filtro las lleva al color de cada empresa
  artFilter: string;
  // Organismo de SST de la empresa: Comité (20 o más trabajadores) o Supervisor
  sstBody: "committee" | "supervisor";
}

// Colores del portal RR. HH. IMAGE & HEALTH
export const BRANDS: Record<CompanyKey, CompanyBrand> = {
  ih: {
    key: "ih",
    logo: "/logos/image-health.png",
    logoWhite: "/logos/image-health-blanco.png",
    main: "#861079",
    accent: "#ad409c",
    deep: "#46133f",
    hue: 306,
    header: "gradient",
    artFilter: "none",
    sstBody: "committee",
  },
  cc: {
    key: "cc",
    logo: "/logos/cc-laboratorios.png",
    logoWhite: "/logos/cc-laboratorios-blanco.png",
    main: "#2585b5",
    accent: "#33bfd4",
    deep: "#174f72",
    hue: 200,
    header: "panel",
    artFilter: "hue-rotate(-108deg) saturate(.95) brightness(1.04)",
    sstBody: "supervisor",
  },
  pf: {
    key: "pf",
    logo: "/logos/poder-fenix-lab.png",
    logoWhite: "/logos/poder-fenix-lab-blanco.png",
    main: "#0d4f8b",
    accent: "#26a9a0",
    deep: "#0a2f55",
    hue: 210,
    header: "panel",
    artFilter: "hue-rotate(-125deg) saturate(.95)",
    sstBody: "supervisor",
  },
};

const MATCHERS: { match: RegExp; key: CompanyKey }[] = [
  { match: /image\s*&?\s*health/i, key: "ih" },
  { match: /cc\s*laboratorios/i, key: "cc" },
  { match: /poder\s*f[eé]nix/i, key: "pf" },
];

export const resolveBrand = (company?: Company | null): CompanyBrand => {
  const key =
    MATCHERS.find((m) => m.match.test(company?.businessName || ""))?.key ||
    "ih";
  const base = BRANDS[key];
  return {
    ...base,
    logo: company?.logoUrl || base.logo,
    hue: company?.brandHue ?? base.hue,
  };
};

export const applyBrand = (brand: CompanyBrand) => {
  const root = document.documentElement;
  root.dataset.company = brand.key;
  root.style.setProperty("--brand-main", brand.main);
  root.style.setProperty("--brand-accent", brand.accent);
  root.style.setProperty("--brand-deep", brand.deep);
  root.style.setProperty("--brand-h", String(brand.hue));
  root.style.setProperty("--art-filter", brand.artFilter);
};

// IMAGE & HEALTH tiene Comité de SST; CC Laboratorios y Poder Fénix, Supervisor de SST
export const sstBodyFor = (company?: Company | null) => resolveBrand(company).sstBody;
