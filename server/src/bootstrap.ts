import type { AppConfig } from "./config/env";
import type { GameDatabase } from "./infrastructure";
import { validateGameConfig } from "./config/game-config";
import { AuthRepository } from "./modules/auth/auth-repository";
import { AuthService, type AuthServicePort } from "./modules/auth/auth-service";
import { TokenService } from "./modules/auth/token-service";
import { HttpWechatCodeExchanger } from "./modules/auth/wechat-client";
import { BootstrapService } from "./modules/bootstrap/bootstrap-service";
import { CultivationRepository } from "./modules/cultivation/cultivation-repository";
import {
  CultivationService,
  type CultivationServicePort,
} from "./modules/cultivation/cultivation-service";
import type { DropRandomInt } from "./modules/cultivation/drop-rewards";
import { InventoryRepository } from "./modules/inventory/inventory-repository";
import {
  InventoryService,
  type InventoryServicePort,
} from "./modules/inventory/inventory-service";
import { LoadoutRepository } from "./modules/loadout/loadout-repository";
import {
  LoadoutService,
  type LoadoutServicePort,
} from "./modules/loadout/loadout-service";
import { PlayerProfileRepository } from "./modules/player-profile/player-profile-repository";
import {
  PlayerProfileService,
  type PlayerProfileServicePort,
} from "./modules/player-profile/player-profile-service";

export interface ServerServices {
  authService: AuthServicePort;
  cultivationService: CultivationServicePort;
  inventoryService?: InventoryServicePort;
  loadoutService?: LoadoutServicePort;
  playerProfileService?: PlayerProfileServicePort;
}

export interface CreateServerServicesOptions {
  dropRandomInt?: DropRandomInt;
}

export function createServerServices(
  config: AppConfig,
  database: GameDatabase,
  options: CreateServerServicesOptions = {},
): ServerServices {
  validateGameConfig();
  const tokenService = new TokenService(config);
  const bootstrapService = new BootstrapService(database);
  const authRepository = new AuthRepository(database);
  const cultivationRepository = new CultivationRepository(
    database,
    options.dropRandomInt,
  );
  const inventoryRepository = new InventoryRepository(database);
  const loadoutRepository = new LoadoutRepository(database);
  const playerProfileRepository = new PlayerProfileRepository(database);
  const wechatCodeExchanger = new HttpWechatCodeExchanger(config);
  const authService = new AuthService(
    config,
    authRepository,
    tokenService,
    bootstrapService,
    wechatCodeExchanger,
  );

  return {
    authService,
    cultivationService: new CultivationService(
      cultivationRepository,
      bootstrapService,
    ),
    inventoryService: new InventoryService(
      inventoryRepository,
      bootstrapService,
    ),
    loadoutService: new LoadoutService(loadoutRepository, bootstrapService),
    playerProfileService: new PlayerProfileService(playerProfileRepository),
  };
}
