/**
 * Convierte una cadena Base64 (URL-safe) en un Uint8Array.
 *
 * Esta función toma una cadena Base64 que puede haber sido codificada de manera
 * segura para URLs (URL-safe), la convierte de nuevo a una cadena Base64 estándar,
 * decodifica esa cadena a binario y finalmente la almacena en un Uint8Array.
 *
 * @param {string} base64String - La cadena Base64 (URL-safe) que se va a convertir.
 * @returns {Uint8Array} - Un Uint8Array que contiene los datos decodificados.
 *
 * @example
 * // Ejemplo de uso:
 * const base64Str = 'SGVsbG8gV29ybGQh';
 * const uint8Array = urlBase64ToUint8Array(base64Str);
 * console.log(uint8Array);
 * // Output: Uint8Array(11) [72, 101, 108, 108, 111, 32, 87, 111, 114, 108, 100]
 */
export function urlBase64ToUint8Array(base64String: string): Uint8Array {
    // Añade el relleno necesario para que la longitud sea un múltiplo de 4
    const padding = "=".repeat((4 - (base64String?.length % 4)) % 4);
    // Reemplaza los caracteres URL-safe por los caracteres estándar de Base64
    const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");

    // Decodifica la cadena Base64 a una cadena binaria
    const rawData = window.atob(base64);
    // Crea un Uint8Array con la longitud de la cadena binaria
    const outputArray = new Uint8Array(rawData.length);

    // Llena el Uint8Array con los valores charCode de la cadena binaria
    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}
