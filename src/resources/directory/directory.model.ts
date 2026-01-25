import mongoose, { Schema } from "mongoose";
import slugPlugin from "@classytic/mongoose-slug-plugin";

/**
 * Sub-schema for Images
 */
const imageSchema = new Schema(
  {
    url: { type: String, required: true, trim: true },
    variants: {
      thumbnail: { type: String, trim: true },
      medium: { type: String, trim: true },
    },
    order: { type: Number, default: 0 },
    isFeatured: { type: Boolean, default: false },
    alt: { type: String, trim: true },
  },
  { _id: false },
);

const directorySchema = new Schema(
  {
    name: { type: String, required: true, trim: true, index: "text" },
    slug: { type: String, unique: true, lowercase: true, index: true },
    profession: {
      type: String,
      enum: [
        "Bookkeeper",
        "Tax Preparer",
        "CPA",
        "Wealth Advisor",
        "Financial Planner",
        "Real Estate Professionals",
        "Immigration Consultants",
        "Others",
      ],
      required: true,
    },
    niche: {
      type: String,
      enum: [
        "Individual/T1",
        "Business/SMB/T2",
        "Self Employed Individual",
        "Real Estate Investor",
        "Professionals",
        "Others",
      ],
      required: true,
    },
    shortDescription: { type: String, trim: true, index: "text" },
    description: { type: String, trim: true, index: "text" },
    website: { type: String, trim: true },
    linkedIn: { type: String, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    phone: { type: String, required: true, trim: true },

    owner: {
      type: Schema.Types.ObjectId,
      ref: "User",
      unique: true,
      sparse: true,
    },
    categories: [
      { type: Schema.Types.ObjectId, ref: "DirectoryCategory", required: true },
    ],

    videoUrl: { type: String, trim: true },
    images: [imageSchema], // Array of the image sub-schema
    certifications: [{ type: String }],

    location: {
      country: { type: String, default: "Canada" },
      province: {
        type: String,
        default: "ON",
        required: true,
      },
      city: { type: String, required: true },
      address: { type: String },
      geo: {
        type: { type: String, enum: ["Point"], default: "Point" },
        coordinates: { type: [Number], index: "2dsphere" },
      },
    },

    status: { type: String, enum: ["active", "inactive"], default: "inactive" },
    featured: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },

    customFields: [
      {
        id: { type: String },
        name: { type: String },
        description: { type: String },
      },
    ],
  },
  { timestamps: true },
);

export type DirectoryDocument = mongoose.InferSchemaType<
  typeof directorySchema
>;

// Apply slug plugin - auto-generates slug from name
directorySchema.plugin(slugPlugin, {
  sourceField: "name",
});

// Indexes for optimized searching
directorySchema.index({ profession: 1 });
directorySchema.index({ "location.province": 1 });

const Directory =
  (mongoose.models.Directory as mongoose.Model<DirectoryDocument>) ||
  mongoose.model<DirectoryDocument>("Directory", directorySchema);

export default Directory;
