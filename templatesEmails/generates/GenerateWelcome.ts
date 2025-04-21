export const GenerateMailSignup = (completeName: string) => {
    const name = completeName.split(" ")[0] as string;
  
    return `<mjml>
    <mj-head>
      <mj-attributes>
        <mj-all font-family="Roboto, sans-serif" />
      </mj-attributes>
      <mj-style inline="inline">
        @import url('https://fonts.googleapis.com/css2?family=Roboto:wght@400;500&display=swap');
      </mj-style>
    </mj-head>
  
    <mj-body>
      <mj-section>
        <mj-column>
          <mj-image width="700px" src="https://res.cloudinary.com/dvquomppa/image/upload/v1717654334/credito_ya/cirm9vbdngqyxymcpfad.png"></mj-image>
        </mj-column>
      </mj-section>
  
  
      <mj-section>
        <mj-column>
          <mj-text font-size="20px" line-height="0px" padding-bottom="20px">
            ${completeName} ¡Bienvenido a Credito Ya!
          </mj-text>
  
          <mj-text font-size="16px" line-height="1.3">
            Es genial contar con tu vinculación y tenerte con nosotros. A través
            de nuestra plataforma amigable puedes realizar tus solicitudes de
            crédito, fácil, rápido y con respuesta inmediata. Nuestro equipo está
            a tu disposición para guiarte y atender todas tus inquietudes.
          </mj-text>
  
          <mj-text font-size="16px" line-height="1.5px">
            Gracias y Bienvenido nuevamente
          </mj-text>
  
          <!-- Aquí es donde agregamos el padding-top -->
          <mj-text font-size="12px" color="#6c6c6c" line-height="0px" font-weight="bold" padding-top="40px">
            Equipo Creditoya
          </mj-text>
  
          <mj-text padding-top="0px" font-size="14px" font-weight="bold">
            Celular Whatsapp 3138994982
          </mj-text>
  
        </mj-column>
      </mj-section>
    </mj-body>
  </mjml>
  `;
  };