export const generateMailPasswordReset = ({
    userId,
    magicLink
}: {
    userId: string;
    magicLink: string
}) => {
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
          <mj-text font-size="16px" font-weight="bold" color="#FF6600">Restablecimiento de Contraseña</mj-text>
          <mj-text font-size="12px" color="#FF6600">ID: ${userId}</mj-text>
        </mj-column>
      </mj-section>
      
      <mj-section>
        <mj-column>
          <mj-text font-size="15px" font-weight="bold">Solicitud de Cambio de Contraseña</mj-text>
          <mj-text font-size="14px">Has solicitado restablecer tu contraseña. Utiliza el botón a continuación para crear una nueva.</mj-text>
        </mj-column>
      </mj-section>
      
      <mj-section>
        <mj-column>
          <mj-text font-size="12px">Este enlace expirará en 30 minutos por seguridad.</mj-text>
          <mj-button background-color="#4CAF50" color="#ffffff" href="${magicLink}">Restablecer Contraseña</mj-button>
        </mj-column>
      </mj-section>
      
      <mj-section>
        <mj-column>
          <mj-text font-size="12px">Si no solicitaste este cambio, ignora este correo o contacta a soporte.</mj-text>
        </mj-column>
      </mj-section>
    </mj-body>
  </mjml>
  `;
};