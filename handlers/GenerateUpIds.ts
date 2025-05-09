interface GenerateUpIdsProps {
    isFlyer?: boolean;
    isLaborCard?: boolean;
    isSignature?: boolean;
}

type IdKeys = 'upid_first_flyer' | 'upid_second_flyer' | 'upid_third_flyer' | 'upid_labor_card' | 'upSignatureId';

type GeneratedIds = Partial<Record<IdKeys, string>>;

/**
 * Genera IDs aleatorios según las opciones proporcionadas
 */
export function RandomUpIdsGenerator({
    isFlyer = false,
    isLaborCard = false,
    isSignature = false
}: GenerateUpIdsProps): GeneratedIds {
    const randomId = () => Math.random().toString(36).substring(2, 15);

    const result: GeneratedIds = {};

    if (isFlyer) {
        result.upid_first_flyer = randomId();
        result.upid_second_flyer = randomId();
        result.upid_third_flyer = randomId();
    }

    if (isLaborCard) {
        result.upid_labor_card = randomId();
    }

    if (isSignature) {
        result.upSignatureId = randomId();
    }

    return result;
}