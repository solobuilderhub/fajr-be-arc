/**
 * Gemini AI Client
 *
 * Wrapper around Google Generative AI SDK for structured JSON output.
 * Supports PDF/image inline data with text prompts.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';

export interface GeminiClientOptions {
  modelName?: string;
  systemInstruction?: string;
  generationConfig?: Record<string, any>;
}

export class GeminiClient {
  private apiKey: string;
  private modelName: string;
  private systemInstruction: string;
  private generationConfig: Record<string, any>;
  private genAI: GoogleGenerativeAI;

  constructor(apiKey: string, options: GeminiClientOptions = {}) {
    this.apiKey = apiKey;
    this.modelName = options.modelName ?? 'gemini-2.5-flash';
    this.systemInstruction = options.systemInstruction ?? '';
    this.generationConfig = options.generationConfig ?? {};
    this.genAI = new GoogleGenerativeAI(this.apiKey);
  }

  private getModel() {
    return this.genAI.getGenerativeModel({
      model: this.modelName,
      systemInstruction: this.systemInstruction,
      generationConfig: this.generationConfig,
    });
  }

  private buildContentParts(
    prompt: string,
    fileBuffer?: Buffer,
    mimeType?: string,
  ): any[] {
    const parts: any[] = [];
    if (fileBuffer && mimeType) {
      parts.push({
        inlineData: {
          data: Buffer.from(fileBuffer).toString('base64'),
          mimeType,
        },
      });
    }
    if (prompt) parts.push(prompt);
    return parts;
  }

  async generateContent(opts: {
    prompt: string;
    fileBuffer?: Buffer;
    mimeType?: string;
  }): Promise<string> {
    const model = this.getModel();
    const parts = this.buildContentParts(opts.prompt, opts.fileBuffer, opts.mimeType);
    const result = await model.generateContent(parts);
    return result.response.text();
  }
}

export default GeminiClient;
