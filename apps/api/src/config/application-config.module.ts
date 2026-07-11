import { Global, Module } from '@nestjs/common';
import { loadApplicationConfig, type ApplicationConfig } from '@meditation/core';

export const APPLICATION_CONFIG = Symbol('APPLICATION_CONFIG');

@Global()
@Module({
  providers: [
    {
      provide: APPLICATION_CONFIG,
      useFactory: (): ApplicationConfig => loadApplicationConfig(),
    },
  ],
  exports: [APPLICATION_CONFIG],
})
export class ApplicationConfigModule {}
