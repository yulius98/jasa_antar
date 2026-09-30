import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { AuthModule } from './auth/auth.module.js';
import { StorageModule } from './storage/storage.module.js';
import { PartnersModule } from './partners/partners.module.js';
import { VehiclesModule } from './vehicles/vehicles.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    StorageModule,
    PartnersModule,
    VehiclesModule,
  ],
  controllers: [AppController],
  providers: [AppService],

})
export class AppModule {}