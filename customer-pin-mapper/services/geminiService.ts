import { GoogleGenAI, Type } from "@google/genai";
import { CustomerPoint } from "../types";

const getAiClient = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    throw new Error("API Key not found");
  }
  return new GoogleGenAI({ apiKey });
};

export const analyzeDeliveryZones = async (points: CustomerPoint[]): Promise<string> => {
  if (points.length === 0) return "ไม่มีข้อมูลสำหรับการวิเคราะห์";

  const ai = getAiClient();
  
  // Prepare data for the prompt (Simplified: Name + Location only)
  const dataSummary = points.map((p, index) => 
    `Customer ${index + 1}: [${p.lat.toFixed(4)}, ${p.lng.toFixed(4)}] - ${p.name}`
  ).join("\n");

  const prompt = `
    I have a list of customer locations for a food delivery business.
    Data:
    ${dataSummary}

    Please analyze this data and provide a response in Thai (ภาษาไทย).
    
    1. Identify clusters or density zones (e.g., "Zone A has high density").
    2. Suggest a center point for a kitchen or distribution hub based on these points.
    3. Calculate roughly the spread of the delivery area.
    4. Provide any logistical advice based purely on location distribution.

    Keep the tone professional and helpful.
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        thinkingConfig: { thinkingBudget: 0 }, // Disable thinking for faster response on simple analysis
      }
    });

    return response.text || "ไม่สามารถวิเคราะห์ข้อมูลได้ในขณะนี้";
  } catch (error) {
    console.error("Gemini Analysis Error:", error);
    return "เกิดข้อผิดพลาดในการเชื่อมต่อกับ AI กรุณาลองใหม่";
  }
};