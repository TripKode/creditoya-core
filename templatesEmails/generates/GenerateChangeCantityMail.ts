export const ChangeCantityMail = ({
  loanId,
  cantity_aproved,
  employeeName,
  reason_aproved,
}: {
  loanId: string;
  cantity_aproved: string;
  employeeName: string;
  reason_aproved: string;
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

    <mj-section background-color="#E0F7FA">
      <mj-column>
        <mj-text font-size="16px" font-weight="bold" color="#00796B">Tu solicitud tiene una nueva cantidad aprobada</mj-text>
        <mj-text font-size="12px" color="#00796B">ID: ${loanId}</mj-text>
      </mj-column>
    </mj-section>

    <mj-section>
      <mj-column>
        <mj-text font-size="15px" font-weight="bold">Cantidad Aprobada</mj-text>
        <mj-text font-size="12px" color="#388E3C">$ ${cantity_aproved}</mj-text>
      </mj-column>
      <mj-column>
        <mj-text font-size="15px" font-weight="bold">Evaluado por:</mj-text>
        <mj-text font-size="12px">${employeeName}</mj-text>
      </mj-column>
    </mj-section>

    <mj-section>
      <mj-column>
        <mj-text font-size="15px" font-weight="bold">Razón de la cantidad aprobada</mj-text>
        <mj-text font-size="12px">${reason_aproved}</mj-text>
      </mj-column>
    </mj-section>

    <mj-section>
      <mj-column>
        <mj-text font-size="12px">Para más detalles, por favor accede aquí a tu cuenta</mj-text>
        <mj-button background-color="#4CAF50" color="#ffffff" href="https://creditoya.space/req/${loanId}" css-class="left-align">Ir a tu cuenta</mj-button>
      </mj-column>
    </mj-section>
  </mj-body>
</mjml>`;
};
