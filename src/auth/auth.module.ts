import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { PrismaModule } from 'src/prisma/prisma.module';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { JwtIntranetStrategy } from './strategies/jwt-intranet.strategy';
import { JwtClientStrategy } from './strategies/jwt-client.strategy';
import { LocalIntranetStrategy } from './strategies/local-intranet.strategy';
import { LocalClientStrategy } from './strategies/local-client.strategy';
import { ConfigModule, ConfigService } from '@nestjs/config';

@Module({
  imports: [
    PrismaModule,
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get('JWT_SECRET'),
        signOptions: { expiresIn: '24h' },
      }),
    }),
    ConfigModule.forRoot({
      isGlobal: true,
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    LocalClientStrategy,
    LocalIntranetStrategy,
    JwtClientStrategy,
    JwtIntranetStrategy,
  ],
})
export class AuthModule { }
