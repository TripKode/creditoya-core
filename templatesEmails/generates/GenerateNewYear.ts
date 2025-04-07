export const generateMailNewYear = ({
    completeName,
}: {
    completeName: string;
}) => {
    return `
    <mjml>
        <mj-head>
            <mj-title>Creación de Préstamo</mj-title>
            <mj-font name="Roboto" href="https://fonts.googleapis.com/css2?family=Roboto:ital,wght@0,100;0,300;0,400;0,500;0,700;0,900;1,100;1,300;1,400;1,500;1,700;1,900&display=swap" />
            <mj-attributes>
                <mj-all font-family="Roboto, sans-serif" font-weight="400" />
            </mj-attributes>
        </mj-head>
        <mj-body>
            <mj-section>
                <mj-column>
                    <mj-image width="200px" src="https://res.cloudinary.com/dvquomppa/image/upload/v1717654334/credito_ya/cirm9vbdngqyxymcpfad.png" />
        
                    <mj-text padding-top="15px">
                    Estimado {{completeName}}
                    </mj-text>
        
                    <mj-text padding-top="7px">
                    En esta temporada tan especial, todo el equipo de Credito Ya quiere desearte una muy Feliz Navidad y un próspero Año Nuevo. Agradecemos sinceramente tu confianza y apoyo durante el año. Que estas fiestas te brinden alegría, paz y éxito en el año que comienza.
                    </mj-text>
        
                    <mj-text padding-top="7px">
                    ¡Felices fiestas!
                    </mj-text>
        
                    <mj-text padding-top="20px" color="#6c6c6c" font-size="14px" font-weight="500">
                    Atentamente,
                    </mj-text>
        
                    <mj-text font-weight="500" font-size="16px">
                    Equipo de Credito Ya
                    </mj-text>
                </mj-column>
            </mj-section>
        </mj-body>
    </mjml>
    `;
};