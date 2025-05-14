export class GenerateMagicLinkDto {
  email: string;
  userType: 'client' | 'intranet';
}

export class ResetPasswordDto {
  token: string;
  newPassword: string;
}

export class ValidateTokenDto {
  token: string;
}
