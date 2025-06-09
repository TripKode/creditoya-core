import { stringToPriceCOP } from "handlers/stringToCop";

export const generateMailCreateLoan = ({
  loanId,
  reqCantity,
}: {
  loanId: string;
  reqCantity: string;
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
          <mj-text font-size="16px" font-weight="bold" color="#FF6600">Nueva solicitud de préstamo creada</mj-text>
          <mj-text font-size="12px" color="#FF6600">ID: ${loanId}</mj-text>
        </mj-column>
      </mj-section>
  
      <mj-section>
        <mj-column>
          <mj-text font-size="15px" font-weight="bold">Cantidad Solicitada</mj-text>
          <mj-text font-size="25px">${stringToPriceCOP(reqCantity)}</mj-text>
        </mj-column>
      </mj-section>
  
      <mj-section>
        <mj-column>
          <mj-text font-size="12px">Para más detalles, por favor accede aquí a tu cuenta</mj-text>
          <mj-button background-color="#4CAF50" color="#ffffff" href="https://creditoya.space/panel/solicitud/${loanId}">Ir a tu prestamo</mj-button>
        </mj-column>
      </mj-section>
    </mj-body>
  </mjml>
  `;
};