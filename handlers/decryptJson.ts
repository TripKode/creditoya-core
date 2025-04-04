import * as CryptoJS from "crypto-js";

/**
 * Descifra un archivo JSON cifrado utilizando AES-256-CBC.
 * @param encryptedData El JSON cifrado en base64.
 * @param key La clave secreta utilizada para el cifrado.
 * @returns El objeto JSON descifrado.
 */
const DecryptJson = ({
  encryptedData,
  password,
}: {
  encryptedData: string;
  password: string;
}) => {
  try {
    const bytes = CryptoJS.AES.decrypt(encryptedData, password);
    const decryptedString = bytes.toString(CryptoJS.enc.Utf8);
    return JSON.parse(decryptedString);
  } catch (error) {
    console.error(error);
    return null;
  }
};

export default DecryptJson;
