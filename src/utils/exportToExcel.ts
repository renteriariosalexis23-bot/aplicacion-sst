import * as XLSX from "xlsx";
import toast from "react-hot-toast";

export const exportToExcel = (
  data: any[],
  filename: string,
  sheetName: string = "Sheet1",
) => {
  if (!data || data.length === 0) {
    toast.error("No hay datos para exportar.");
    return;
  }

  // Create a new workbook
  const wb = XLSX.utils.book_new();

  // Convert JSON data to worksheet
  const ws = XLSX.utils.json_to_sheet(data);

  // Add the worksheet to the workbook
  XLSX.utils.book_append_sheet(wb, ws, sheetName);

  // Generate Excel file and trigger download
  XLSX.writeFile(
    wb,
    `${filename}_${new Date().toISOString().split("T")[0]}.xlsx`,
  );
};
