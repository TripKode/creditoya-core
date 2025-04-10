export type BankTypes =
  | "bancolombia"
  | "banco-bogota"
  | "davivienda"
  | "bbva"
  | "av-villas"
  | "banco-popular"
  | "colpatria"
  | "banco-caja-social"
  | "itau"
  | "scotiabank-colpatria"
  | "citibank"
  | "gnb-sudameris"
  | "bancoomeva"
  | "banco-pichincha"
  | "banco-agrario"
  | "banco-cooperativo"
  | "bancamia"
  | "banco-occidente"
  | "banco-falabella";

export const handleKeyToString = (key: BankTypes): string => {
  switch (key) {
    case "bancolombia":
      return "Bancolombia";
    case "banco-bogota":
      return "Banco de Bogotá";
    case "davivienda":
      return "Davivienda";
    case "bbva":
      return "BBVA";
    case "av-villas":
      return "Banco Av Villas";
    case "banco-popular":
      return "Banco Popular";
    case "colpatria":
      return "Colpatria";
    case "banco-caja-social":
      return "Banco Caja Social";
    case "itau":
      return "Itaú";
    case "scotiabank-colpatria":
      return "Scotiabank Colpatria";
    case "citibank":
      return "Citibank";
    case "gnb-sudameris":
      return "GNB Sudameris";
    case "bancoomeva":
      return "Bancoomeva";
    case "banco-pichincha":
      return "Banco Pichincha";
    case "banco-agrario":
      return "Banco Agrario";
    case "banco-cooperativo":
      return "Banco Cooperativo";
    case "bancamia":
      return "Bancamía";
    case "banco-occidente":
      return "Banco de Occidente";
    case "banco-falabella":
      return "Banco Falabella";
    default:
      return "Desconocido";
  }
};