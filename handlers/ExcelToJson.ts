import { utils, WorkBook } from "xlsx";

export interface TableProps {
  [key: string]: string | undefined;
}

export function xlsxTojson(workbook: WorkBook) {
  // Name of first page on the workbook
  const sheetName = workbook.SheetNames[0];

  // We obtain the data from the sheet
  const worksheet = workbook.Sheets[sheetName];

  // We convert the data from the sheet to JSON
  const data = utils.sheet_to_json(worksheet, { header: 1 }) as string[][];

  // get the row of headers
  const headerRows = data[0];

  // We create an array to store the TableProps objects
  const tablePropsArray: TableProps[] = [];

  // Iterate over the data to create the TableProps objects
  for (let i = 1; i < data.length; i++) {
    let row = data[i];
    let table: TableProps = {};

    row.forEach((cellData, columnIndex) => {
      // Name of the property according to the column header
      const propName = headerRows[columnIndex];

      // Assign the value of the cell to the corresponding property
      table[propName] = cellData;
    });

    tablePropsArray.push(table);
  }

  return tablePropsArray;
}
