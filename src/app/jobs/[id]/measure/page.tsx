"use client";

import { useParams } from "next/navigation";
import { RoofMeasureEditor } from "@/components/roof-measure-editor";

export default function RoofMeasurePage() {
  const params = useParams<{ id: string }>();
  const jobId = typeof params.id === "string" ? params.id : "";
  if (!jobId) return null;
  return <RoofMeasureEditor key={jobId} jobId={jobId} />;
}
