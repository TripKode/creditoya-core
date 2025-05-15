export const generateMailPasswordResetSuccess = ({
  userId,
}: {
  userId: string;
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
          <mj-text font-size="16px" font-weight="bold" color="#FF6600">Contraseña Restablecida con Éxito</mj-text>
          <mj-text font-size="12px" color="#FF6600">ID: ${userId}</mj-text>
        </mj-column>
      </mj-section>
      
      <mj-section>
        <mj-column>
          <mj-text font-size="15px" font-weight="bold">¡Cambio de Contraseña Completado!</mj-text>
          <mj-text font-size="14px">Tu contraseña ha sido restablecida exitosamente. Ya puedes iniciar sesión con tu nueva contraseña.</mj-text>
        </mj-column>
      </mj-section>
      
      <mj-section>
        <mj-column>
          <mj-text font-size="12px">Por seguridad, te recomendamos no compartir tu contraseña y cambiarla regularmente.</mj-text>
        </mj-column>
      </mj-section>
    </mj-body>
  </mjml>
  `;
};