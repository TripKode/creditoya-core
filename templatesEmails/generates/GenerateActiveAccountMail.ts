export const ActiveAccountMail = ({
  completeName,
  mail,
  password,
}: {
  completeName: string;
  mail: string;
  password: string;
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
        <mj-text font-size="16px" font-weight="bold" color="#00796B">Bienvenido a la intranet de Creditoya</mj-text>
        <mj-text font-size="12px" color="#00796B">${completeName}</mj-text>
      </mj-column>
    </mj-section>

    <mj-section>
      <mj-column>
        <mj-text font-size="15px" font-weight="bold">Pasos a seguir para activar tu cuenta</mj-text>
        <mj-text font-size="12px" color="#388E3C">Ingresa a la intranet desde la pagina web</mj-text>
        <mj-text font-size="12px" color="#388E3C">Ingresa tus credenciales:</mj-text>
        <mj-text font-size="12px" line-height="1" color="#388E3C" font-weight="bold">Correo Electronico : </mj-text>
        <mj-text line-height="0">${mail}</mj-text>
        <mj-text font-size="12px" line-height="1" color="#388E3C" font-weight="bold">Contraseña ( Temporal ) :</mj-text>
        <mj-text line-height="0">${password}</mj-text>
      </mj-column>
    </mj-section>

    <mj-section>
      <mj-column>
        <mj-text font-size="12px">Para más detalles, por favor accede aquí a tu cuenta</mj-text>
        <mj-button background-color="#4CAF50" color="#ffffff" href="https://creditoya.space/" css-class="left-align">Visitar Intranet</mj-button>
      </mj-column>
    </mj-section>
  </mj-body>
</mjml>`;
};
