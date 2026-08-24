import { Annotation, StateGraph } from "@langchain/langgraph";
import { queryFormCorrections } from "@/lib/ai/vectorStore";
import { analyzeVideoFrames } from "@/lib/ai/vision";

export const FormCorrectionState = Annotation.Root({
  exerciseName: Annotation<string>(),
  userContext: Annotation<string>(),
  videoUrl: Annotation<string>(),
  detectedFlaws: Annotation<string[]>(),
  formAnalysisFeedback: Annotation<string>(),
  formCorrections: Annotation<string[]>(),
  annotatedImage: Annotation<string | null>(),
});

export async function analyzeFormNode(state: typeof FormCorrectionState.State) {
  console.log(`[Vision Node] Analyzing: ${state.exerciseName}`);

  const { detectedFlaws, formAnalysisFeedback, formCorrections, annotatedImage } =
    await analyzeVideoFrames(state.exerciseName, state.videoUrl, state.userContext);

  return {
    detectedFlaws,
    formAnalysisFeedback,
    formCorrections,
    annotatedImage,
  };
}

// Gemini (via vision_engine.py) generates form corrections directly, tailored
// to what it actually observed. This node only backfills from the static
// local database as a fallback, for the rare case Gemini flags flaws but
// returns no corrections for them (e.g. a partial/odd response).
export async function fetchFormCorrectionsNode(state: typeof FormCorrectionState.State) {
  if (state.formCorrections.length > 0 || state.detectedFlaws.length === 0) {
    return {};
  }

  console.log(`[Vector Store Node] Falling back to local corrections for: ${state.detectedFlaws.join(", ")}`);
  const corrections = await queryFormCorrections(state.detectedFlaws);

  return {
    formCorrections: corrections,
  };
}

export const graph = new StateGraph(FormCorrectionState)
  .addNode("analyzeForm", analyzeFormNode)
  .addNode("fetchFormCorrections", fetchFormCorrectionsNode)
  .addEdge("__start__", "analyzeForm")
  .addEdge("analyzeForm", "fetchFormCorrections")
  .addEdge("fetchFormCorrections", "__end__")
  .compile();
