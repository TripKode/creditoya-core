export const generateSecurityNoticeEmail = ({
    title,
    securityMessage,
    additionalMessages,
    bannerImageUrl,
    recipientName,
    senderName,
}: {
    title: string;
    securityMessage: string;
    additionalMessages?: Array<{
        title: string;
        content: string;
    }>;
    bannerImageUrl?: string;
    recipientName?: string;
    senderName?: string;
}) => {
    return `<mjml>
  <mj-head>
    <mj-attributes>
      <mj-all font-family="Roboto, sans-serif" />
    </mj-attributes>
    <mj-style inline="inline">
      @import url('https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;700&display=swap');
      .security-content p { margin: 12px 0; }
      .security-content ul, .security-content ol { margin: 12px 0; padding-left: 20px; }
      .security-content li { margin: 4px 0; }
      .security-content h1, .security-content h2, .security-content h3 { margin: 16px 0 8px 0; }
      .alert-banner { 
        background: linear-gradient(135deg, #ff6b6b 0%, #ee5a24 100%); 
        border-radius: 8px;
        padding: 15px;
        margin: 10px 0;
      }
      .section-divider {
        border-top: 1px solid #e0e0e0;
        margin: 20px 0;
      }
      .banner-image {
        width: 100% !important;
        height: auto !important;
        max-width: 600px !important;
        display: block !important;
      }
    </mj-style>
  </mj-head>
 
  <mj-body background-color="#f5f5f5">
    ${bannerImageUrl ? `
    <!-- Banner personalizado -->
    <mj-section background-color="#ffffff" padding="0px 20px 20px 20px">
      <mj-column>
        <mj-image 
          width="600px" 
          height="172px"
          src="${bannerImageUrl}" 
          alt="Security Banner"
          css-class="banner-image"
          fluid-on-mobile="true"
          border-radius="8px"
        ></mj-image>
      </mj-column>
    </mj-section>
    ` : `
    <!-- Banner de alerta de seguridad por defecto -->
    <mj-section background-color="#ffffff" padding="0px 20px">
      <mj-column>
        <mj-table css-class="alert-banner">
          <tr>
            <td style="padding: 15px; text-align: 1;">
              <span style="font-size: 24px; margin-right: 10px;">🔒</span>
              <span style="color: #ffffff; font-size: 18px; font-weight: 600;">AVISO IMPORTANTE DE SEGURIDAD</span>
            </td>
          </tr>
        </mj-table>
      </mj-column>
    </mj-section>
    `}

    <!-- Saludo personalizado -->
    <mj-section background-color="#ffffff" padding="20px 20px 0px 20px">
      <mj-column>
        ${recipientName ?
            `<mj-text font-size="16px" color="#333333" font-weight="400">Estimado/a ${recipientName},</mj-text>` :
            `<mj-text font-size="16px" color="#333333" font-weight="400">Estimado/a cliente,</mj-text>`
        }
      </mj-column>
    </mj-section>

    <!-- Título principal -->
    <mj-section background-color="#ffffff" padding="15px 20px">
      <mj-column>
        <mj-text font-size="22px" font-weight="500" color="#2c3e50" line-height="1.3">
          ${title}
        </mj-text>
      </mj-column>
    </mj-section>

    <!-- Contenido principal del mensaje de seguridad -->
    <mj-section background-color="#ffffff" padding="0px 20px 20px 20px">
      <mj-column>
        <mj-text font-size="15px" color="#444444" line-height="1.6" css-class="security-content">
          ${securityMessage}
        </mj-text>
      </mj-column>
    </mj-section>

    ${additionalMessages && additionalMessages.length > 0 ? 
      additionalMessages.map((message, index) => `
        <!-- Separador para mensaje adicional -->
        <mj-section background-color="#ffffff" padding="0px 20px">
          <mj-column>
            <mj-divider border-color="#e0e0e0" border-width="1px"></mj-divider>
          </mj-column>
        </mj-section>

        <!-- Mensaje adicional ${index + 1} -->
        <mj-section background-color="#ffffff" padding="20px 20px 0px 20px">
          <mj-column>
            <mj-text font-size="18px" font-weight="500" color="#2c3e-50" line-height="1.3">
              ${message.title}
            </mj-text>
          </mj-column>
        </mj-section>

        <mj-section background-color="#ffffff" padding="0px 20px 20px 20px">
          <mj-column>
            <mj-text font-size="15px" color="#444444" line-height="1.6" css-class="security-content">
              ${message.content}
            </mj-text>
          </mj-column>
        </mj-section>
      `).join('') : ''
    }

    <!-- Separador visual -->
    <mj-section background-color="#ffffff" padding="0px 20px">
      <mj-column>
        <mj-divider border-color="#e0e0e0" border-width="1px"></mj-divider>
      </mj-column>
    </mj-section>

    <!-- Información de contacto -->
    <mj-section background-color="#ffffff" padding="20px">
      <mj-column>
        <mj-text font-size="14px" color="#666666" align="center">
          <strong>¿Necesitas ayuda?</strong><br/>
          Estamos aquí para asistirte en cualquier momento
        </mj-text>
        <mj-button 
          background-color="#e74c3c" 
          color="#ffffff" 
          border-radius="6px"
          font-size="14px"
          font-weight="500"
          padding="12px 30px"
          href="https://creditoya.space/"
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
          Cordialmente, <strong>${senderName}</strong><br/>
          <span style="color: #888888;">Equipo de Seguridad</span>
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
        <mj-text font-size="12px" color="#aaaaaa" align="center">
          © 2025 CreditoYa. Todos los derechos reservados.<br/>
          Este es un correo automático, por favor no responder directamente.
        </mj-text>
      </mj-column>
    </mj-section>
  </mj-body>
</mjml>`;
};