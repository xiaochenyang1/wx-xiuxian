CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"wx_openid" varchar(128) NOT NULL,
	"wx_unionid" varchar(128),
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_login_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "accounts_status_ck" CHECK ("accounts"."status" in ('active', 'banned', 'deleted'))
);
--> statement-breakpoint
CREATE TABLE "asset_ledger" (
	"id" uuid PRIMARY KEY NOT NULL,
	"player_id" uuid NOT NULL,
	"asset_type" varchar(32) NOT NULL,
	"asset_key" varchar(128) NOT NULL,
	"delta" numeric(78, 0) NOT NULL,
	"balance_after" numeric(78, 0),
	"reason" varchar(64) NOT NULL,
	"reference_type" varchar(32) NOT NULL,
	"reference_id" uuid NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "asset_ledger_asset_type_ck" CHECK ("asset_ledger"."asset_type" in ('currency', 'item', 'equipment', 'technique'))
);
--> statement-breakpoint
CREATE TABLE "auth_sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"account_id" uuid NOT NULL,
	"refresh_token_hash" varchar(64) NOT NULL,
	"device_key_hash" varchar(128),
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "equipment_instances" (
	"id" uuid PRIMARY KEY NOT NULL,
	"player_id" uuid NOT NULL,
	"equipment_config_id" varchar(64) NOT NULL,
	"quality" varchar(20) NOT NULL,
	"enhance_level" smallint DEFAULT 0 NOT NULL,
	"rolled_affixes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"location" varchar(20) DEFAULT 'bag' NOT NULL,
	"equipped_slot" varchar(32),
	"is_locked" boolean DEFAULT false NOT NULL,
	"config_version" varchar(64) NOT NULL,
	"acquired_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "equipment_instances_enhance_level_ck" CHECK ("equipment_instances"."enhance_level" between 0 and 20),
	CONSTRAINT "equipment_instances_location_ck" CHECK ("equipment_instances"."location" in ('bag', 'equipped', 'harvest', 'mail', 'consumed'))
);
--> statement-breakpoint
CREATE TABLE "harvest_chest_entries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"player_id" uuid NOT NULL,
	"entry_type" varchar(20) NOT NULL,
	"equipment_instance_id" uuid,
	"technique_config_id" varchar(64),
	"quality" varchar(20) NOT NULL,
	"value_score" numeric(78, 0) DEFAULT '0' NOT NULL,
	"config_version" varchar(64) NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"acquired_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	CONSTRAINT "harvest_chest_entry_type_ck" CHECK ("harvest_chest_entries"."entry_type" in ('equipment', 'technique')),
	CONSTRAINT "harvest_chest_exactly_one_asset_ck" CHECK ((case when "harvest_chest_entries"."equipment_instance_id" is null then 0 else 1 end) + (case when "harvest_chest_entries"."technique_config_id" is null then 0 else 1 end) = 1),
	CONSTRAINT "harvest_chest_status_ck" CHECK ("harvest_chest_entries"."status" in ('pending', 'transferred', 'salvaged', 'mailed'))
);
--> statement-breakpoint
CREATE TABLE "idempotency_records" (
	"account_id" uuid NOT NULL,
	"scope" varchar(64) NOT NULL,
	"idempotency_key" varchar(128) NOT NULL,
	"request_hash" varchar(64) NOT NULL,
	"status_code" integer NOT NULL,
	"response_body" jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "idempotency_records_account_id_scope_idempotency_key_pk" PRIMARY KEY("account_id","scope","idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "inventory_stacks" (
	"player_id" uuid NOT NULL,
	"item_config_id" varchar(64) NOT NULL,
	"quantity" numeric(78, 0) NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_stacks_player_id_item_config_id_pk" PRIMARY KEY("player_id","item_config_id"),
	CONSTRAINT "inventory_stacks_quantity_ck" CHECK ("inventory_stacks"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "newcomer_task_progress" (
	"player_id" uuid NOT NULL,
	"task_config_id" varchar(64) NOT NULL,
	"progress" numeric(78, 0) DEFAULT '0' NOT NULL,
	"completed_at" timestamp with time zone,
	"claimed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "newcomer_task_progress_player_id_task_config_id_pk" PRIMARY KEY("player_id","task_config_id"),
	CONSTRAINT "newcomer_task_progress_ck" CHECK ("newcomer_task_progress"."progress" >= 0)
);
--> statement-breakpoint
CREATE TABLE "offline_settlements" (
	"id" uuid PRIMARY KEY NOT NULL,
	"player_id" uuid NOT NULL,
	"from_time" timestamp with time zone NOT NULL,
	"to_time" timestamp with time zone NOT NULL,
	"effective_seconds" integer NOT NULL,
	"offline_efficiency_bp" integer NOT NULL,
	"reward_snapshot" jsonb NOT NULL,
	"config_versions" jsonb NOT NULL,
	"base_credited_at" timestamp with time zone NOT NULL,
	"ad_bonus_claimed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "offline_settlements_effective_seconds_ck" CHECK ("offline_settlements"."effective_seconds" between 0 and 86400),
	CONSTRAINT "offline_settlements_window_ck" CHECK ("offline_settlements"."to_time" >= "offline_settlements"."from_time"),
	CONSTRAINT "offline_settlements_efficiency_ck" CHECK ("offline_settlements"."offline_efficiency_bp" >= 0)
);
--> statement-breakpoint
CREATE TABLE "player_progress" (
	"player_id" uuid PRIMARY KEY NOT NULL,
	"level" integer DEFAULT 1 NOT NULL,
	"realm_key" varchar(64) DEFAULT 'qi_refining' NOT NULL,
	"exp" numeric(78, 0) DEFAULT '0' NOT NULL,
	"exp_remainder_micros" bigint DEFAULT 0 NOT NULL,
	"progression_state" varchar(32) DEFAULT 'gaining' NOT NULL,
	"total_power" numeric(78, 0) DEFAULT '100' NOT NULL,
	"cultivation_reserve" numeric(78, 0) DEFAULT '0' NOT NULL,
	"last_settled_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_heartbeat_at" timestamp with time zone,
	"drop_clock_remainder_micros" bigint DEFAULT 0 NOT NULL,
	"version" bigint DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "player_progress_level_ck" CHECK ("player_progress"."level" >= 1),
	CONSTRAINT "player_progress_exp_ck" CHECK ("player_progress"."exp" >= 0),
	CONSTRAINT "player_progress_state_ck" CHECK ("player_progress"."progression_state" in ('gaining', 'breakthrough_ready', 'version_cap')),
	CONSTRAINT "player_progress_exp_remainder_ck" CHECK ("player_progress"."exp_remainder_micros" >= 0 and "player_progress"."exp_remainder_micros" < 1000000),
	CONSTRAINT "player_progress_drop_remainder_ck" CHECK ("player_progress"."drop_clock_remainder_micros" >= 0 and "player_progress"."drop_clock_remainder_micros" < 60000000)
);
--> statement-breakpoint
CREATE TABLE "player_settings" (
	"player_id" uuid PRIMARY KEY NOT NULL,
	"bag_capacity" smallint DEFAULT 50 NOT NULL,
	"auto_salvage_common" boolean DEFAULT true NOT NULL,
	"auto_salvage_uncommon" boolean DEFAULT true NOT NULL,
	"partner_unlock_notice_seen" boolean DEFAULT false NOT NULL,
	"selected_tab" varchar(20) DEFAULT 'cultivation' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "player_settings_bag_capacity_ck" CHECK ("player_settings"."bag_capacity" between 50 and 200 and ("player_settings"."bag_capacity" - 50) % 10 = 0)
);
--> statement-breakpoint
CREATE TABLE "player_wallets" (
	"player_id" uuid PRIMARY KEY NOT NULL,
	"spirit_stone" numeric(78, 0) DEFAULT '0' NOT NULL,
	"immortal_jade" numeric(78, 0) DEFAULT '0' NOT NULL,
	"lifetime_spirit_stone_earned" numeric(78, 0) DEFAULT '0' NOT NULL,
	"stone_remainder_micros" bigint DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "player_wallets_spirit_stone_ck" CHECK ("player_wallets"."spirit_stone" >= 0),
	CONSTRAINT "player_wallets_immortal_jade_ck" CHECK ("player_wallets"."immortal_jade" >= 0),
	CONSTRAINT "player_wallets_stone_remainder_ck" CHECK ("player_wallets"."stone_remainder_micros" >= 0 and "player_wallets"."stone_remainder_micros" < 1000000)
);
--> statement-breakpoint
CREATE TABLE "players" (
	"id" uuid PRIMARY KEY NOT NULL,
	"account_id" uuid NOT NULL,
	"display_name" varchar(48) NOT NULL,
	"display_name_key" varchar(64) NOT NULL,
	"avatar_variant" varchar(20) DEFAULT 'neutral' NOT NULL,
	"free_rename_available" boolean DEFAULT true NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "players_avatar_variant_ck" CHECK ("players"."avatar_variant" in ('neutral', 'male', 'female')),
	CONSTRAINT "players_status_ck" CHECK ("players"."status" in ('active', 'banned', 'deleted'))
);
--> statement-breakpoint
CREATE TABLE "reserved_player_names" (
	"display_name_key" varchar(64) PRIMARY KEY NOT NULL,
	"previous_player_id" uuid NOT NULL,
	"release_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "technique_progress" (
	"player_id" uuid NOT NULL,
	"technique_config_id" varchar(64) NOT NULL,
	"star" smallint DEFAULT 1 NOT NULL,
	"duplicate_count" integer DEFAULT 0 NOT NULL,
	"equipped_slot" varchar(20),
	"config_version" varchar(64) NOT NULL,
	"acquired_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "technique_progress_player_id_technique_config_id_pk" PRIMARY KEY("player_id","technique_config_id"),
	CONSTRAINT "technique_progress_star_ck" CHECK ("technique_progress"."star" between 1 and 10),
	CONSTRAINT "technique_progress_duplicate_count_ck" CHECK ("technique_progress"."duplicate_count" >= 0)
);
--> statement-breakpoint
ALTER TABLE "asset_ledger" ADD CONSTRAINT "asset_ledger_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipment_instances" ADD CONSTRAINT "equipment_instances_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "harvest_chest_entries" ADD CONSTRAINT "harvest_chest_entries_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "harvest_chest_entries" ADD CONSTRAINT "harvest_chest_entries_equipment_instance_id_equipment_instances_id_fk" FOREIGN KEY ("equipment_instance_id") REFERENCES "public"."equipment_instances"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idempotency_records" ADD CONSTRAINT "idempotency_records_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_stacks" ADD CONSTRAINT "inventory_stacks_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "newcomer_task_progress" ADD CONSTRAINT "newcomer_task_progress_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offline_settlements" ADD CONSTRAINT "offline_settlements_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_progress" ADD CONSTRAINT "player_progress_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_settings" ADD CONSTRAINT "player_settings_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_wallets" ADD CONSTRAINT "player_wallets_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "players" ADD CONSTRAINT "players_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reserved_player_names" ADD CONSTRAINT "reserved_player_names_previous_player_id_players_id_fk" FOREIGN KEY ("previous_player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "technique_progress" ADD CONSTRAINT "technique_progress_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_wx_openid_uq" ON "accounts" USING btree ("wx_openid");--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_wx_unionid_uq" ON "accounts" USING btree ("wx_unionid");--> statement-breakpoint
CREATE INDEX "asset_ledger_player_created_idx" ON "asset_ledger" USING btree ("player_id","created_at");--> statement-breakpoint
CREATE INDEX "asset_ledger_reference_idx" ON "asset_ledger" USING btree ("reference_type","reference_id");--> statement-breakpoint
CREATE UNIQUE INDEX "auth_sessions_refresh_hash_uq" ON "auth_sessions" USING btree ("refresh_token_hash");--> statement-breakpoint
CREATE INDEX "auth_sessions_account_expires_idx" ON "auth_sessions" USING btree ("account_id","expires_at");--> statement-breakpoint
CREATE INDEX "equipment_instances_player_location_idx" ON "equipment_instances" USING btree ("player_id","location");--> statement-breakpoint
CREATE UNIQUE INDEX "equipment_instances_player_slot_uq" ON "equipment_instances" USING btree ("player_id","equipped_slot") WHERE "equipment_instances"."location" = 'equipped' and "equipment_instances"."equipped_slot" is not null;--> statement-breakpoint
CREATE INDEX "harvest_chest_player_pending_idx" ON "harvest_chest_entries" USING btree ("player_id","status","acquired_at");--> statement-breakpoint
CREATE INDEX "idempotency_records_expires_idx" ON "idempotency_records" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "offline_settlements_player_window_uq" ON "offline_settlements" USING btree ("player_id","from_time","to_time");--> statement-breakpoint
CREATE INDEX "offline_settlements_player_created_idx" ON "offline_settlements" USING btree ("player_id","created_at");--> statement-breakpoint
CREATE INDEX "player_progress_power_idx" ON "player_progress" USING btree ("total_power");--> statement-breakpoint
CREATE INDEX "player_progress_level_exp_idx" ON "player_progress" USING btree ("level","exp");--> statement-breakpoint
CREATE UNIQUE INDEX "players_account_uq" ON "players" USING btree ("account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "players_display_name_key_uq" ON "players" USING btree ("display_name_key");--> statement-breakpoint
CREATE INDEX "reserved_player_names_release_idx" ON "reserved_player_names" USING btree ("release_at");--> statement-breakpoint
CREATE UNIQUE INDEX "technique_progress_player_slot_uq" ON "technique_progress" USING btree ("player_id","equipped_slot") WHERE "technique_progress"."equipped_slot" is not null;