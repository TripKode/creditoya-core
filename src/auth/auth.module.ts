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
import { RedisModule } from 'src/redis/redis.module';
import { ClientService } from 'src/client/client.service';
import { ClientModule } from 'src/client/client.module';
import { MailModule } from 'src/mail/mail.module';
import { GoogleCloudModule } from 'src/gcp/gcp.module';
import { CloudinaryModule } from 'src/cloudinary/cloudinary.module';

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
    RedisModule,
    ClientModule,
    MailModule,
    GoogleCloudModule,
    CloudinaryModule
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    LocalClientStrategy,
    LocalIntranetStrategy,
    JwtClientStrategy,
    JwtIntranetStrategy,
    ClientService
  ],
})
export class AuthModule { }
