export const generateCustomEmail = ({
    subject,
    message,
    senderName,
    recipientName,
}: {
    subject: string;
    message: string;
    senderName?: string;
    recipientName?: string;
}) => {
    return `<mjml>
  <mj-head>
    <mj-attributes>
      <mj-all font-family="Roboto, sans-serif" />
    </mj-attributes>
    <mj-style inline="inline">
      @import url('https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;700&display=swap');
      .message-content p { margin: 12px 0; }
      .message-content ul, .message-content ol { margin: 12px 0; padding-left: 20px; }
      .message-content li { margin: 4px 0; }
      .message-content h1, .message-content h2, .message-content h3 { margin: 16px 0 8px 0; }
      .divider { border-top: 1px solid #e0e0e0; margin: 20px 0; }
    </mj-style>
  </mj-head>
 
  <mj-body background-color="#f5f5f5">
    <!-- Header con logo -->
    <mj-section background-color="#ffffff" padding="30px 20px 20px 20px">
      <mj-column>
        <mj-image width="180px" src="https://res.cloudinary.com/dvquomppa/image/upload/v1717654334/credito_ya/cirm9vbdngqyxymcpfad.png" alt="Company Logo"></mj-image>
      </mj-column>
    </mj-section>

    <!-- Saludo personalizado -->
    <mj-section background-color="#ffffff" padding="0px 20px">
      <mj-column>
        ${recipientName ?
            `<mj-text font-size="16px" color="#333333" font-weight="400">Estimado/a ${recipientName},</mj-text>` :
            `<mj-text font-size="16px" color="#333333" font-weight="400">Estimado/a cliente,</mj-text>`
        }
      </mj-column>
    </mj-section>

    <!-- Asunto destacado -->
    <mj-section background-color="#ffffff" padding="15px 20px">
      <mj-column>
        <mj-text font-size="22px" font-weight="500" color="#2c3e50" line-height="1.3">
          ${subject}
        </mj-text>
      </mj-column>
    </mj-section>

    <!-- Contenido principal del mensaje -->
    <mj-section background-color="#ffffff" padding="0px 20px 30px 20px">
      <mj-column>
        <mj-text font-size="15px" color="#444444" line-height="1.6" css-class="message-content">
          ${message}
        </mj-text>
      </mj-column>
    </mj-section>

    <!-- Separador visual -->
    <mj-section background-color="#ffffff" padding="0px 20px">
      <mj-column>
        <mj-divider border-color="#e0e0e0" border-width="1px"></mj-divider>
      </mj-column>
    </mj-section>

    <!-- Información de contacto y soporte -->
    <mj-section background-color="#ffffff" padding="20px">
      <mj-column>
        <mj-text font-size="14px" color="#666666" align="center">
          <strong>¿Necesitas ayuda?</strong><br/>
          Estamos aquí para asistirte en cualquier momento
        </mj-text>
        <mj-button 
          background-color="#4CAF50" 
          color="#ffffff" 
          border-radius="6px"
          font-size="14px"
          font-weight="500"
          padding="12px 30px"
          href="https://creditoya.space/soporte"
          css-class="center-align">
          Contactar Soporte
        </mj-button>
      </mj-column>
    </mj-section>

    ${senderName ? `
    <!-- Firma personalizada -->
    <mj-section background-color="#ffffff" padding="20px 20px 0px 20px">
      <mj-column>
        <mj-text font-size="14px" color="#555555">
          Cordialmente,<br/>
          <strong>${senderName}</strong><br/>
          <span style="color: #888888;">Equipo de Atención al Cliente</span>
        </mj-text>
      </mj-column>
    </mj-section>
    ` : ''}

    <!-- Footer con información adicional -->
    <mj-section background-color="#f8f9fa" padding="25px 20px">
      <mj-column>
        <mj-text font-size="12px" color="#888888" align="center" line-height="1.5">
          <strong>Información importante:</strong><br/>
          Este correo contiene información confidencial destinada únicamente al destinatario indicado.
          Si no eres el destinatario, por favor elimina este mensaje y notifícanos.
        </mj-text>
        <mj-spacer height="15px"></mj-spacer>
        <mj-text font-size="11px" color="#aaaaaa" align="center">
          © 2025 CreditoYa. Todos los derechos reservados.<br/>
          Este es un correo automático, por favor no responder directamente.
        </mj-text>
      </mj-column>
    </mj-section>
  </mj-body>
</mjml>`;
};