-- CreateEnum
CREATE TYPE "MediaFrequency" AS ENUM ('every_scene', 'key_moments', 'manual', 'off');

-- CreateEnum
CREATE TYPE "MediaTypes" AS ENUM ('images', 'videos', 'both', 'none');

-- CreateEnum
CREATE TYPE "AudioMode" AS ENUM ('none', 'effects_only', 'voiceover_only', 'full_character');

-- CreateEnum
CREATE TYPE "SubscriptionTier" AS ENUM ('free', 'basic', 'pro', 'unlimited');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('active', 'cancelled', 'past_due');

-- CreateEnum
CREATE TYPE "StoryStatus" AS ENUM ('in_progress', 'completed', 'abandoned');

-- CreateEnum
CREATE TYPE "SceneType" AS ENUM ('dialogue', 'action', 'exploration', 'decision');

-- CreateEnum
CREATE TYPE "AIProvider" AS ENUM ('claude', 'grok', 'gemini');

-- CreateEnum
CREATE TYPE "PuzzleStatus" AS ENUM ('pending', 'active', 'completed', 'failed');

-- CreateEnum
CREATE TYPE "PuzzleLinkType" AS ENUM ('sequential', 'parallel', 'conditional');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "firebase_uid" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "display_name" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_preferences" (
    "user_id" TEXT NOT NULL,
    "media_frequency" "MediaFrequency" NOT NULL DEFAULT 'key_moments',
    "media_types" "MediaTypes" NOT NULL DEFAULT 'images',
    "audio_mode" "AudioMode" NOT NULL DEFAULT 'none',
    "preferred_themes" JSONB NOT NULL DEFAULT '[]',
    "narrator_style" TEXT NOT NULL DEFAULT 'balanced',
    "crt_effects_enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_preferences_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "stripe_subscription_id" TEXT,
    "stripe_customer_id" TEXT,
    "tier" "SubscriptionTier" NOT NULL DEFAULT 'free',
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'active',
    "current_period_start" TIMESTAMP(3),
    "current_period_end" TIMESTAMP(3),
    "stories_used_this_period" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stories" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "title" TEXT,
    "status" "StoryStatus" NOT NULL DEFAULT 'in_progress',
    "genre_tags" JSONB NOT NULL DEFAULT '[]',
    "initial_interview" JSONB,
    "story_seed" JSONB,
    "current_chapter_id" TEXT,
    "current_scene_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "stories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chapters" (
    "id" TEXT NOT NULL,
    "story_id" TEXT NOT NULL,
    "chapter_number" INTEGER NOT NULL,
    "title" TEXT,
    "summary" TEXT,
    "status" TEXT NOT NULL DEFAULT 'in_progress',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "chapters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scenes" (
    "id" TEXT NOT NULL,
    "chapter_id" TEXT NOT NULL,
    "scene_number" INTEGER NOT NULL,
    "scene_type" "SceneType" NOT NULL,
    "narrative_text" TEXT NOT NULL,
    "player_input" TEXT,
    "ai_provider" "AIProvider" NOT NULL,
    "tokens_used" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scenes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "characters" (
    "id" TEXT NOT NULL,
    "story_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "personality_traits" JSONB NOT NULL DEFAULT '{}',
    "relationships" JSONB NOT NULL DEFAULT '[]',
    "first_appearance_scene_id" TEXT,
    "last_seen_scene_id" TEXT,
    "is_major_character" BOOLEAN NOT NULL DEFAULT false,
    "image_url" TEXT,
    "elevenlabs_voice_id" TEXT,
    "voice_settings" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "current_room_id" TEXT,

    CONSTRAINT "characters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "locations" (
    "id" TEXT NOT NULL,
    "story_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "attributes" JSONB NOT NULL DEFAULT '{}',
    "connected_locations" JSONB NOT NULL DEFAULT '[]',
    "first_appearance_scene_id" TEXT,
    "image_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "events" (
    "id" TEXT NOT NULL,
    "story_id" TEXT NOT NULL,
    "scene_id" TEXT,
    "event_type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "outcome" TEXT,
    "impact_score" INTEGER NOT NULL DEFAULT 0,
    "involved_characters" JSONB NOT NULL DEFAULT '[]',
    "involved_locations" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "items" (
    "id" TEXT NOT NULL,
    "story_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "properties" JSONB NOT NULL DEFAULT '{}',
    "current_owner_id" TEXT,
    "current_location_id" TEXT,
    "first_appearance_scene_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "personality_scores" (
    "id" TEXT NOT NULL,
    "story_id" TEXT NOT NULL,
    "openness" DECIMAL(5,2) NOT NULL DEFAULT 50,
    "conscientiousness" DECIMAL(5,2) NOT NULL DEFAULT 50,
    "extraversion" DECIMAL(5,2) NOT NULL DEFAULT 50,
    "agreeableness" DECIMAL(5,2) NOT NULL DEFAULT 50,
    "neuroticism" DECIMAL(5,2) NOT NULL DEFAULT 50,
    "openness_confidence" INTEGER NOT NULL DEFAULT 0,
    "conscientiousness_confidence" INTEGER NOT NULL DEFAULT 0,
    "extraversion_confidence" INTEGER NOT NULL DEFAULT 0,
    "agreeableness_confidence" INTEGER NOT NULL DEFAULT 0,
    "neuroticism_confidence" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "personality_scores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "personality_events" (
    "id" TEXT NOT NULL,
    "story_id" TEXT NOT NULL,
    "scene_id" TEXT,
    "room_id" TEXT,
    "dilemma_id" TEXT,
    "player_action" TEXT NOT NULL,
    "choice_context" TEXT,
    "alternatives_available" JSONB NOT NULL DEFAULT '[]',
    "dimension" TEXT NOT NULL,
    "delta" DECIMAL(5,2) NOT NULL,
    "confidence" INTEGER NOT NULL DEFAULT 5,
    "reasoning" TEXT NOT NULL,
    "is_key_moment" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "personality_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "story_analyses" (
    "id" TEXT NOT NULL,
    "story_id" TEXT NOT NULL,
    "final_scores" JSONB NOT NULL,
    "personality_summary" TEXT NOT NULL,
    "key_moments" JSONB NOT NULL DEFAULT '[]',
    "archetype" TEXT NOT NULL,
    "growth_narrative" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "story_analyses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "callback_candidates" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "source_story_id" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "memorability_score" INTEGER NOT NULL DEFAULT 0,
    "themes" JSONB NOT NULL DEFAULT '[]',
    "summary" TEXT NOT NULL,
    "times_used" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "callback_candidates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "callback_instances" (
    "id" TEXT NOT NULL,
    "callback_candidate_id" TEXT NOT NULL,
    "target_story_id" TEXT NOT NULL,
    "target_scene_id" TEXT,
    "adaptation_notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "callback_instances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "generated_media" (
    "id" TEXT NOT NULL,
    "story_id" TEXT NOT NULL,
    "scene_id" TEXT,
    "media_type" TEXT NOT NULL,
    "prompt_used" TEXT NOT NULL,
    "gcs_url" TEXT NOT NULL,
    "gcs_url_raw" TEXT,
    "thumbnail_url" TEXT,
    "generation_cost" DECIMAL(10,4),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "generated_media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "generated_audio" (
    "id" TEXT NOT NULL,
    "story_id" TEXT NOT NULL,
    "scene_id" TEXT,
    "audio_type" TEXT NOT NULL,
    "character_id" TEXT,
    "text_content" TEXT,
    "effect_name" TEXT,
    "elevenlabs_voice_id" TEXT,
    "gcs_url" TEXT NOT NULL,
    "duration_seconds" DECIMAL(8,2),
    "generation_cost" DECIMAL(10,4),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "generated_audio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sound_effects" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "tags" JSONB NOT NULL DEFAULT '[]',
    "gcs_url" TEXT NOT NULL,
    "duration_seconds" DECIMAL(8,2),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sound_effects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "character_backstory" (
    "id" TEXT NOT NULL,
    "story_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "background" TEXT NOT NULL,
    "is_revealed" BOOLEAN NOT NULL DEFAULT false,
    "traits" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "character_backstory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "player_abilities" (
    "id" TEXT NOT NULL,
    "story_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "level" DECIMAL(5,2) NOT NULL DEFAULT 1,
    "times_used" INTEGER NOT NULL DEFAULT 0,
    "times_succeeded" INTEGER NOT NULL DEFAULT 0,
    "last_used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "origin" TEXT NOT NULL DEFAULT 'attempted',
    "trigger_verbs" JSONB NOT NULL DEFAULT '[]',
    "trigger_nouns" JSONB NOT NULL DEFAULT '[]',

    CONSTRAINT "player_abilities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "skill_checks" (
    "id" TEXT NOT NULL,
    "story_id" TEXT NOT NULL,
    "ability_name" TEXT NOT NULL,
    "ability_level" DECIMAL(5,2) NOT NULL,
    "difficulty" INTEGER NOT NULL,
    "roll" INTEGER NOT NULL,
    "total" DECIMAL(5,2) NOT NULL,
    "success" BOOLEAN NOT NULL,
    "is_nat_20" BOOLEAN NOT NULL DEFAULT false,
    "is_nat_1" BOOLEAN NOT NULL DEFAULT false,
    "skill_gain" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "context" TEXT NOT NULL,
    "narrative" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "skill_checks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "game_transcript" (
    "id" TEXT NOT NULL,
    "story_id" TEXT NOT NULL,
    "turn_number" INTEGER NOT NULL,
    "speaker" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "message_type" TEXT NOT NULL DEFAULT 'narrative',
    "room_id" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "game_transcript_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "timed_events" (
    "id" TEXT NOT NULL,
    "story_id" TEXT NOT NULL,
    "room_id" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "turns_remaining" INTEGER NOT NULL,
    "total_turns" INTEGER NOT NULL,
    "progress_narratives" JSONB NOT NULL DEFAULT '[]',
    "trigger_narrative" TEXT NOT NULL,
    "consequence" JSONB NOT NULL DEFAULT '{}',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_triggered" BOOLEAN NOT NULL DEFAULT false,
    "can_be_prevented" BOOLEAN NOT NULL DEFAULT true,
    "prevention_hint" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "triggered_at" TIMESTAMP(3),

    CONSTRAINT "timed_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rooms" (
    "id" TEXT NOT NULL,
    "story_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "short_description" TEXT,
    "x" INTEGER NOT NULL,
    "y" INTEGER NOT NULL,
    "z" INTEGER NOT NULL DEFAULT 0,
    "north_room_id" TEXT,
    "south_room_id" TEXT,
    "east_room_id" TEXT,
    "west_room_id" TEXT,
    "up_room_id" TEXT,
    "down_room_id" TEXT,
    "is_story_critical" BOOLEAN NOT NULL DEFAULT false,
    "is_generated" BOOLEAN NOT NULL DEFAULT false,
    "first_visited_at" TIMESTAMP(3),
    "visit_count" INTEGER NOT NULL DEFAULT 0,
    "atmosphere" JSONB NOT NULL DEFAULT '{}',
    "hidden_exits" JSONB NOT NULL DEFAULT '[]',
    "discovered_exits" JSONB NOT NULL DEFAULT '[]',
    "is_vehicle" BOOLEAN NOT NULL DEFAULT false,
    "vehicle_type" TEXT,
    "docked_at_room_id" TEXT,
    "previous_docked_at_id" TEXT,
    "known_destinations" JSONB NOT NULL DEFAULT '[]',
    "boarding_keywords" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "game_objects" (
    "id" TEXT NOT NULL,
    "story_id" TEXT NOT NULL,
    "room_id" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "synonyms" JSONB NOT NULL DEFAULT '[]',
    "is_takeable" BOOLEAN NOT NULL DEFAULT true,
    "is_container" BOOLEAN NOT NULL DEFAULT false,
    "is_open" BOOLEAN NOT NULL DEFAULT false,
    "is_locked" BOOLEAN NOT NULL DEFAULT false,
    "key_object_id" TEXT,
    "state" JSONB NOT NULL DEFAULT '{}',
    "state_description" TEXT,
    "system_id" TEXT,
    "is_story_critical" BOOLEAN NOT NULL DEFAULT false,
    "first_examined_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "contained_in_id" TEXT,

    CONSTRAINT "game_objects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "object_systems" (
    "id" TEXT NOT NULL,
    "story_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "system_state" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "object_systems_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "player_state" (
    "id" TEXT NOT NULL,
    "story_id" TEXT NOT NULL,
    "current_room_id" TEXT NOT NULL,
    "turn_count" INTEGER NOT NULL DEFAULT 0,
    "score" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "player_state_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interaction_cache" (
    "id" TEXT NOT NULL,
    "story_id" TEXT NOT NULL,
    "room_id" TEXT,
    "object_id" TEXT,
    "character_id" TEXT,
    "command_type" TEXT NOT NULL,
    "command_target" TEXT NOT NULL,
    "command_hash" TEXT NOT NULL,
    "semantic_topics" JSONB NOT NULL DEFAULT '[]',
    "semantic_hash" TEXT,
    "response" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "interaction_cache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "story_facts" (
    "id" TEXT NOT NULL,
    "story_id" TEXT NOT NULL,
    "fact_type" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "importance" INTEGER NOT NULL DEFAULT 5,
    "is_contradicted" BOOLEAN NOT NULL DEFAULT false,
    "is_secret" BOOLEAN NOT NULL DEFAULT false,
    "is_revealed" BOOLEAN NOT NULL DEFAULT false,
    "revealed_at" TIMESTAMP(3),
    "deflection_hint" TEXT,
    "reveal_trigger" TEXT,
    "topics" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "story_facts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dilemma_points" (
    "id" TEXT NOT NULL,
    "story_id" TEXT NOT NULL,
    "room_id" TEXT,
    "story_beat_id" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "primary_dimension" TEXT NOT NULL,
    "secondary_dimension" TEXT,
    "option_a" JSONB NOT NULL,
    "option_b" JSONB NOT NULL,
    "option_c" JSONB,
    "is_triggered" BOOLEAN NOT NULL DEFAULT false,
    "triggered_at" TIMESTAMP(3),
    "chosen_option" TEXT,
    "player_response" TEXT,
    "prerequisite_event_ids" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dilemma_points_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "story_beats" (
    "id" TEXT NOT NULL,
    "story_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "beat_order" INTEGER NOT NULL,
    "is_completed" BOOLEAN NOT NULL DEFAULT false,
    "completed_at" TIMESTAMP(3),
    "chosen_resolution" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "story_beats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "puzzles" (
    "id" TEXT NOT NULL,
    "story_id" TEXT NOT NULL,
    "story_beat_id" TEXT,
    "room_id" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "branch_path" TEXT,
    "is_bottleneck" BOOLEAN NOT NULL DEFAULT false,
    "status" "PuzzleStatus" NOT NULL DEFAULT 'pending',
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "reward_type" TEXT,
    "reward_data" JSONB NOT NULL DEFAULT '{}',
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "is_discovered" BOOLEAN NOT NULL DEFAULT false,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "is_initial_objective" BOOLEAN NOT NULL DEFAULT false,
    "discovers_on_room_entry" BOOLEAN NOT NULL DEFAULT false,
    "target_dilemma_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "puzzles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "puzzle_steps" (
    "id" TEXT NOT NULL,
    "puzzle_id" TEXT NOT NULL,
    "step_number" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "hint" TEXT,
    "node_type" TEXT NOT NULL DEFAULT 'action',
    "target_id" TEXT,
    "target_name" TEXT,
    "completion_action" TEXT,
    "required_items" JSONB NOT NULL DEFAULT '[]',
    "required_room" TEXT,
    "gives_item" TEXT,
    "gives_clue" TEXT,
    "reveals_steps" JSONB NOT NULL DEFAULT '[]',
    "is_revealed" BOOLEAN NOT NULL DEFAULT false,
    "revealed_by" TEXT,
    "reveal_triggers" JSONB NOT NULL DEFAULT '[]',
    "is_completed" BOOLEAN NOT NULL DEFAULT false,
    "completed_at" TIMESTAMP(3),
    "timed_event_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "puzzle_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "puzzle_links" (
    "id" TEXT NOT NULL,
    "source_puzzle_id" TEXT NOT NULL,
    "target_puzzle_id" TEXT NOT NULL,
    "link_type" "PuzzleLinkType" NOT NULL DEFAULT 'sequential',
    "condition" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "puzzle_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_firebase_uid_key" ON "users"("firebase_uid");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_user_id_key" ON "subscriptions"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_stripe_subscription_id_key" ON "subscriptions"("stripe_subscription_id");

-- CreateIndex
CREATE UNIQUE INDEX "personality_scores_story_id_key" ON "personality_scores"("story_id");

-- CreateIndex
CREATE UNIQUE INDEX "story_analyses_story_id_key" ON "story_analyses"("story_id");

-- CreateIndex
CREATE UNIQUE INDEX "character_backstory_story_id_key" ON "character_backstory"("story_id");

-- CreateIndex
CREATE UNIQUE INDEX "player_abilities_story_id_name_key" ON "player_abilities"("story_id", "name");

-- CreateIndex
CREATE INDEX "game_transcript_story_id_turn_number_idx" ON "game_transcript"("story_id", "turn_number");

-- CreateIndex
CREATE INDEX "timed_events_story_id_is_active_idx" ON "timed_events"("story_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "rooms_story_id_x_y_z_key" ON "rooms"("story_id", "x", "y", "z");

-- CreateIndex
CREATE UNIQUE INDEX "player_state_story_id_key" ON "player_state"("story_id");

-- CreateIndex
CREATE INDEX "interaction_cache_story_id_command_hash_idx" ON "interaction_cache"("story_id", "command_hash");

-- CreateIndex
CREATE INDEX "interaction_cache_story_id_semantic_hash_idx" ON "interaction_cache"("story_id", "semantic_hash");

-- CreateIndex
CREATE UNIQUE INDEX "dilemma_points_story_beat_id_key" ON "dilemma_points"("story_beat_id");

-- CreateIndex
CREATE UNIQUE INDEX "story_beats_story_id_beat_order_key" ON "story_beats"("story_id", "beat_order");

-- CreateIndex
CREATE UNIQUE INDEX "puzzle_steps_puzzle_id_step_number_key" ON "puzzle_steps"("puzzle_id", "step_number");

-- CreateIndex
CREATE UNIQUE INDEX "puzzle_links_source_puzzle_id_target_puzzle_id_key" ON "puzzle_links"("source_puzzle_id", "target_puzzle_id");

-- AddForeignKey
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stories" ADD CONSTRAINT "stories_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chapters" ADD CONSTRAINT "chapters_story_id_fkey" FOREIGN KEY ("story_id") REFERENCES "stories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scenes" ADD CONSTRAINT "scenes_chapter_id_fkey" FOREIGN KEY ("chapter_id") REFERENCES "chapters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "characters" ADD CONSTRAINT "characters_story_id_fkey" FOREIGN KEY ("story_id") REFERENCES "stories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "characters" ADD CONSTRAINT "characters_first_appearance_scene_id_fkey" FOREIGN KEY ("first_appearance_scene_id") REFERENCES "scenes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "characters" ADD CONSTRAINT "characters_last_seen_scene_id_fkey" FOREIGN KEY ("last_seen_scene_id") REFERENCES "scenes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "characters" ADD CONSTRAINT "characters_current_room_id_fkey" FOREIGN KEY ("current_room_id") REFERENCES "rooms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "locations" ADD CONSTRAINT "locations_story_id_fkey" FOREIGN KEY ("story_id") REFERENCES "stories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "locations" ADD CONSTRAINT "locations_first_appearance_scene_id_fkey" FOREIGN KEY ("first_appearance_scene_id") REFERENCES "scenes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_story_id_fkey" FOREIGN KEY ("story_id") REFERENCES "stories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_scene_id_fkey" FOREIGN KEY ("scene_id") REFERENCES "scenes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "items" ADD CONSTRAINT "items_story_id_fkey" FOREIGN KEY ("story_id") REFERENCES "stories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "items" ADD CONSTRAINT "items_current_owner_id_fkey" FOREIGN KEY ("current_owner_id") REFERENCES "characters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "items" ADD CONSTRAINT "items_current_location_id_fkey" FOREIGN KEY ("current_location_id") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "items" ADD CONSTRAINT "items_first_appearance_scene_id_fkey" FOREIGN KEY ("first_appearance_scene_id") REFERENCES "scenes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "personality_scores" ADD CONSTRAINT "personality_scores_story_id_fkey" FOREIGN KEY ("story_id") REFERENCES "stories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "personality_events" ADD CONSTRAINT "personality_events_story_id_fkey" FOREIGN KEY ("story_id") REFERENCES "stories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "personality_events" ADD CONSTRAINT "personality_events_scene_id_fkey" FOREIGN KEY ("scene_id") REFERENCES "scenes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "story_analyses" ADD CONSTRAINT "story_analyses_story_id_fkey" FOREIGN KEY ("story_id") REFERENCES "stories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "callback_candidates" ADD CONSTRAINT "callback_candidates_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "callback_candidates" ADD CONSTRAINT "callback_candidates_source_story_id_fkey" FOREIGN KEY ("source_story_id") REFERENCES "stories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "callback_instances" ADD CONSTRAINT "callback_instances_callback_candidate_id_fkey" FOREIGN KEY ("callback_candidate_id") REFERENCES "callback_candidates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "callback_instances" ADD CONSTRAINT "callback_instances_target_story_id_fkey" FOREIGN KEY ("target_story_id") REFERENCES "stories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "callback_instances" ADD CONSTRAINT "callback_instances_target_scene_id_fkey" FOREIGN KEY ("target_scene_id") REFERENCES "scenes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generated_media" ADD CONSTRAINT "generated_media_story_id_fkey" FOREIGN KEY ("story_id") REFERENCES "stories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generated_media" ADD CONSTRAINT "generated_media_scene_id_fkey" FOREIGN KEY ("scene_id") REFERENCES "scenes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generated_audio" ADD CONSTRAINT "generated_audio_story_id_fkey" FOREIGN KEY ("story_id") REFERENCES "stories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generated_audio" ADD CONSTRAINT "generated_audio_scene_id_fkey" FOREIGN KEY ("scene_id") REFERENCES "scenes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generated_audio" ADD CONSTRAINT "generated_audio_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "character_backstory" ADD CONSTRAINT "character_backstory_story_id_fkey" FOREIGN KEY ("story_id") REFERENCES "stories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_abilities" ADD CONSTRAINT "player_abilities_story_id_fkey" FOREIGN KEY ("story_id") REFERENCES "stories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skill_checks" ADD CONSTRAINT "skill_checks_story_id_fkey" FOREIGN KEY ("story_id") REFERENCES "stories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_transcript" ADD CONSTRAINT "game_transcript_story_id_fkey" FOREIGN KEY ("story_id") REFERENCES "stories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timed_events" ADD CONSTRAINT "timed_events_story_id_fkey" FOREIGN KEY ("story_id") REFERENCES "stories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timed_events" ADD CONSTRAINT "timed_events_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_story_id_fkey" FOREIGN KEY ("story_id") REFERENCES "stories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_docked_at_room_id_fkey" FOREIGN KEY ("docked_at_room_id") REFERENCES "rooms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_objects" ADD CONSTRAINT "game_objects_system_id_fkey" FOREIGN KEY ("system_id") REFERENCES "object_systems"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_objects" ADD CONSTRAINT "game_objects_story_id_fkey" FOREIGN KEY ("story_id") REFERENCES "stories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_objects" ADD CONSTRAINT "game_objects_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_objects" ADD CONSTRAINT "game_objects_contained_in_id_fkey" FOREIGN KEY ("contained_in_id") REFERENCES "game_objects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "object_systems" ADD CONSTRAINT "object_systems_story_id_fkey" FOREIGN KEY ("story_id") REFERENCES "stories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_state" ADD CONSTRAINT "player_state_story_id_fkey" FOREIGN KEY ("story_id") REFERENCES "stories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interaction_cache" ADD CONSTRAINT "interaction_cache_story_id_fkey" FOREIGN KEY ("story_id") REFERENCES "stories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "story_facts" ADD CONSTRAINT "story_facts_story_id_fkey" FOREIGN KEY ("story_id") REFERENCES "stories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dilemma_points" ADD CONSTRAINT "dilemma_points_story_id_fkey" FOREIGN KEY ("story_id") REFERENCES "stories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dilemma_points" ADD CONSTRAINT "dilemma_points_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dilemma_points" ADD CONSTRAINT "dilemma_points_story_beat_id_fkey" FOREIGN KEY ("story_beat_id") REFERENCES "story_beats"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "story_beats" ADD CONSTRAINT "story_beats_story_id_fkey" FOREIGN KEY ("story_id") REFERENCES "stories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "puzzles" ADD CONSTRAINT "puzzles_story_id_fkey" FOREIGN KEY ("story_id") REFERENCES "stories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "puzzles" ADD CONSTRAINT "puzzles_story_beat_id_fkey" FOREIGN KEY ("story_beat_id") REFERENCES "story_beats"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "puzzles" ADD CONSTRAINT "puzzles_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "puzzles" ADD CONSTRAINT "puzzles_target_dilemma_id_fkey" FOREIGN KEY ("target_dilemma_id") REFERENCES "dilemma_points"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "puzzle_steps" ADD CONSTRAINT "puzzle_steps_puzzle_id_fkey" FOREIGN KEY ("puzzle_id") REFERENCES "puzzles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "puzzle_steps" ADD CONSTRAINT "puzzle_steps_timed_event_id_fkey" FOREIGN KEY ("timed_event_id") REFERENCES "timed_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "puzzle_links" ADD CONSTRAINT "puzzle_links_source_puzzle_id_fkey" FOREIGN KEY ("source_puzzle_id") REFERENCES "puzzles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "puzzle_links" ADD CONSTRAINT "puzzle_links_target_puzzle_id_fkey" FOREIGN KEY ("target_puzzle_id") REFERENCES "puzzles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
