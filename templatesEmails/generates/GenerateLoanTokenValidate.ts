type MailProps = {
  token: string
}

export const generateMailTokenValidateLoan = ({ token }: MailProps) => {
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
          <mj-image width="200px" src="https://res.cloudinary.com/dvquomppa/image/upload/v1717654334/credito_ya/cirm9vbdngqyxymcpfad.png"></mj-image>
        </mj-column>
      </mj-section>
      
      <mj-section background-color="#FFEBCC">
        <mj-column>
          <mj-text font-size="16px" font-weight="bold" color="#FF6600">Verificación de solicitud de préstamo</mj-text>
          <mj-text font-size="12px" color="#FF6600">Código de verificación</mj-text>
        </mj-column>
      </mj-section>
      
      <mj-section>
        <mj-column>
          <mj-text font-size="15px" font-weight="bold">Código de verificación para tu solicitud:</mj-text>
          <mj-text font-size="24px" align="center" font-weight="bold">${token}</mj-text>
        </mj-column>
      </mj-section>
      
      <mj-section>
        <mj-column>
          <mj-text font-size="12px">Por favor ingresa este código en la plataforma para continuar con tu solicitud de préstamo.</mj-text>
          <mj-button background-color="#4CAF50" color="#ffffff" href="https://creditoya.space/panel/nueva-solicitud">Ir a verificar</mj-button>
        </mj-column>
      </mj-section>
    </mj-body>
  </mjml>
  `;
};