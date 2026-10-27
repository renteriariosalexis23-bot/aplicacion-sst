// Administrador principal de la plataforma. Si cambia, actualizar también
// isDefaultAdmin() en firestore.rules.
export const MAIN_ADMIN_EMAIL = "alexis9283alexis@gmail.com";

export const isMainAdmin = (email?: string | null) =>
  (email || "").toLowerCase() === MAIN_ADMIN_EMAIL;
