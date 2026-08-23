import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { graph } from "@/lib/ai/graph";

export async function POST(request: Request) {
  let tempVideoPath: string | null = null;

  try {
    const formData = await request.formData();
    const exerciseName = formData.get("exerciseName");
    const userContextField = formData.get("userContext");
    const video = formData.get("video");

    if (typeof exerciseName !== "string" || !exerciseName.trim()) {
      return NextResponse.json(
        { error: "Missing required field: exerciseName" },
        { status: 400 }
      );
    }

    const userContext = typeof userContextField === "string" ? userContextField : "";

    if (!(video instanceof File)) {
      return NextResponse.json(
        { error: "Missing required field: video" },
        { status: 400 }
      );
    }

    const extension = path.extname(video.name) || ".mp4";
    tempVideoPath = path.join(
      os.tmpdir(),
      `audit-${Date.now()}-${Math.random().toString(36).slice(2)}${extension}`
    );
    await fs.writeFile(tempVideoPath, Buffer.from(await video.arrayBuffer()));

    // Invoke the LangGraph workflow with the initial state inputs
    const result = await graph.invoke({
      exerciseName,
      userContext,
      videoUrl: tempVideoPath,
      detectedFlaws: [],
      formAnalysisFeedback: "",
      formCorrections: [],
    });

    return NextResponse.json({
      success: true,
      data: {
        detectedFlaws: result.detectedFlaws,
        feedback: result.formAnalysisFeedback,
        formCorrections: result.formCorrections,
      },
    });
  } catch (error: any) {
    console.error("[API Audit Error]:", error);
    return NextResponse.json(
      { error: "Internal Server Error", details: error.message },
      { status: 500 }
    );
  } finally {
    if (tempVideoPath) {
      await fs.unlink(tempVideoPath).catch(() => {});
    }
  }
}
