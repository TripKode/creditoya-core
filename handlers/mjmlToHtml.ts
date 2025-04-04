export async function MJMLtoHTML(content: string): Promise<string> {
    try {
      // Verifica que content no esté vacío
      if (!content) {
        throw new Error("MJML content is required.");
      }
  
      const response = await fetch("https://api.mjml.io/v1/render", {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(
            `${process.env.MJMLApplicationID}:${process.env.MJMLSecretKey}`
          ).toString("base64")}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ mjml: content }),
      });
  
      // Verifica si la respuesta es exitosa
      if (!response.ok) {
        const errorMessage = await response.text();
        console.error("Error details:", errorMessage);
        throw new Error(
          `Error converting MJML to HTML: ${response.status} - ${response.statusText}`
        );
      }
  
      // Parsear el resultado a JSON
      const result = await response.json();
  
      // Extraer el HTML del resultado
      const html = result.html;
  
      return html;
    } catch (error) {
      // Manejo del error
      if (error instanceof Error) {
        console.error("Error converting MJML:", error.message);
      } else {
        console.error("Unknown error:", error);
      }
      throw error; // Lanza el error para que la función que lo llama lo maneje
    }
  }
  