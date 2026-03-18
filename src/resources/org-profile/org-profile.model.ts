/**
 * Organization Profile Model
 *
 * Extended business data for each organization (1:1 with Better Auth organization).
 * Unique index on organizationId enforces singleton-per-org constraint.
 *
 * Replaces the old Business model from fajr-be-old.
 */

import mongoose from 'mongoose';

const { Schema } = mongoose;

const orgProfileSchema = new Schema(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      required: true,
      unique: true,
      index: true,
    },

    // Business identity
    name: { type: String, required: true, trim: true },
    address: { type: String, trim: true },
    country: {
      type: String,
      required: true,
      enum: ['Canada', 'USA', 'UK'],
      default: 'Canada',
    },
    region: { type: String, trim: true },
    currency: {
      type: String,
      required: true,
      uppercase: true,
      default: 'CAD',
      maxlength: 3,
    },

    // AI configuration
    aiGuide: { type: String, trim: true },

    // Onboarding status
    status: {
      type: String,
      enum: ['pending', 'completed'],
      default: 'pending',
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

const OrgProfile =
  mongoose.models.OrgProfile ||
  mongoose.model('OrgProfile', orgProfileSchema);

export default OrgProfile;
