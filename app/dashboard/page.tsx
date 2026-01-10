"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { clearAuth, getToken, getUser, User } from "@/lib/auth";
import { RiskGauge } from "@/components/RiskGauge";
import Image from "next/image";
import dynamic from "next/dynamic";

const Plot = dynamic(() => import("react-plotly.js"), { ssr: false });

// Simple markdown to HTML converter for AI recommendations
function renderMarkdown(markdown: string): string {
  if (!markdown) return "";

  let html = markdown;

  // Split into lines for processing
  const lines = html.split('\n');
  const processedLines: string[] = [];
  let inList = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Check if line is a bullet point (starts with * or -)
    if (line.match(/^[\*\-]\s+/)) {
      if (!inList) {
        processedLines.push('<ul>');
        inList = true;
      }

      // Remove bullet marker and process content
      let content = line.replace(/^[\*\-]\s+/, '');

      // Convert bold **text** to <strong>text</strong> (handle multiple bold sections)
      content = content.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

      processedLines.push(`<li>${content}</li>`);
    } else {
      // If we were in a list, close it
      if (inList) {
        processedLines.push('</ul>');
        inList = false;
      }

      // Process non-list lines
      if (line) {
        // Convert bold **text** to <strong>text</strong>
        let processedLine = line.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        processedLines.push(`<p>${processedLine}</p>`);
      } else {
        // Empty line
        processedLines.push('');
      }
    }
  }

  // Close list if still open
  if (inList) {
    processedLines.push('</ul>');
  }

  html = processedLines.join('\n');

  // Clean up empty paragraphs
  html = html.replace(/<p><\/p>/g, '');
  html = html.replace(/<p>\s*<\/p>/g, '');

  return html;
}

type PredictionResponse = {
  risk_score: number;
  risk_category: string;
  timestamp: string;
  drug_analysis?: any;
  shap_top_contributors?: { feature: string; shap_value: number }[];
  recommendations?: string[];
  ai_recommendations_md?: string | null;
};

type RecordOut = {
  id: number;
  patient_name?: string | null;
  risk_score: number;
  risk_category: string;
  created_at: string;
  patient_data: any;
  prediction_result: any;
  clinical_recommendations?: string | null;
};

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);

  // Sidebar "Navigate": Dashboard / My History / Admin Panel
  const [view, setView] = useState<"dashboard" | "history" | "admin">("dashboard");

  // Tabs inside dashboard
  const tabs = ["Patients", "ADR Predictions", "Explainability", "Bias Audit", "Workflow Efficiency"] as const;
  const [tab, setTab] = useState<(typeof tabs)[number]>("Patients");

  // Patient + prediction state
  const [patientData, setPatientData] = useState<any>({
    anchor_age: 65,
    gender: "M",
    weight: 70.0,
    height: 170.0,
    admission_type: "Emergency",
    ward: "ICU",
    num_admissions: 1,
    avg_los_days: 4.5,
    total_procedures: 0,
    comorbidities: [],
    selected_drugs: [],
    // labs (default values)
    lab_creatinine: 1.0,
    lab_hemoglobin: 13.5,
    lab_white_blood_cells: 7.5,
    lab_platelet_count: 250.0,
    lab_alt: 25,
    lab_ast: 30,
    lab_bilirubin: 0.8,
    lab_egfr: 90,
    lab_alp: 70,
    lab_sodium: 140,
    lab_potassium: 4.0,
    lab_calcium_total: 9.0,
    lab_magnesium: 2.0,
    // vitals
    vital_heart_rate: 72,
    vital_respiratory_rate: 16,
    vital_temperature_celsius: 37.0,
    vital_spo2: 98,
    vital_arterial_blood_pressure_systolic: 120,
    vital_arterial_blood_pressure_diastolic: 80,
    vital_arterial_blood_pressure_mean: 93,
    // organ support
    on_oxygen: false,
    on_ventilator: false,
    on_dialysis: false,
    on_vasopressors: false,
    // comorbidities (structured)
    hypertension: false,
    diabetes_type1: false,
    diabetes_type2: false,
    cad_hf: false,
    aki: false,
    ckd: false,
    chronic_liver_disease: false,
    copd_asthma: false,
    malignancy: false,
    immunosuppressed: false
  });

  const [medications, setMedications] = useState<any[]>([]);
  const [drugOptions, setDrugOptions] = useState<string[]>([]);
  const [selectedDrug, setSelectedDrug] = useState("");
  const [manualDrugName, setManualDrugName] = useState("");
  const [drugDose, setDrugDose] = useState("");
  const [drugRoute, setDrugRoute] = useState("PO (Oral)");
  const [drugFreq, setDrugFreq] = useState("OD");
  const [drugDuration, setDrugDuration] = useState(0);
  const [drugStartDate, setDrugStartDate] = useState("");
  const [drugNarrowTI, setDrugNarrowTI] = useState(false);
  const [drugNephrotoxic, setDrugNephrotoxic] = useState(false);
  const [drugHepatotoxic, setDrugHepatotoxic] = useState(false);
  const [drugQTProlonging, setDrugQTProlonging] = useState(false);
  const [drugHighRisk, setDrugHighRisk] = useState(false);

  // Workflow efficiency state
  const [feedbackUsefulness, setFeedbackUsefulness] = useState<string>("Moderately Useful");
  const [feedbackAccuracy, setFeedbackAccuracy] = useState<string>("Neutral");
  const [feedbackResponseTime, setFeedbackResponseTime] = useState<string>("Acceptable");
  const [feedbackWorkloadReduction, setFeedbackWorkloadReduction] = useState<string>("Moderate Reduction");
  const [feedbackComments, setFeedbackComments] = useState<string>("");
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);
  const [prediction, setPrediction] = useState<PredictionResponse | null>(null);
  const [predicting, setPredicting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadMethod, setUploadMethod] = useState<"manual" | "json" | "csv">("manual");
  const [uploadFile, setUploadFile] = useState<File | null>(null);

  // History/admin
  const [history, setHistory] = useState<RecordOut[]>([]);
  const [adminRecords, setAdminRecords] = useState<any[]>([]);

  interface GroupMetrics {
    Group: string;
    auc_roc: number;
    precision: number;
    recall: number;
    f1: number;
    accuracy: number;
    balanced_accuracy: number;
    auc_pr: number;
    matthews_corrcoef: number;
  }

  interface MetricsData {
    overall: GroupMetrics;
    groups: GroupMetrics[];
  }

  const [metrics, setMetrics] = useState<MetricsData | null>(null);
  const [featureImportance, setFeatureImportance] = useState<{ feature: string; importance: number }[]>([]);
  const [explainabilityTab, setExplainabilityTab] = useState<"global" | "patient">("patient");

  useEffect(() => {
    if (!getToken()) router.replace("/auth");
    setUser(getUser());

    // Load drug options from static JSON file
    fetch("/drugs.json")
      .then((res) => res.json())
      .then((data) => {
        console.log("Drugs loaded from JSON:", data);
        if (data.drugs && data.drugs.length > 0) {
          const options = ["Select a drug...", ...data.drugs, "Other"];
          console.log("Setting drug options:", options.length, "items");
          setDrugOptions(options);
        } else {
          console.warn("No drugs loaded from JSON");
          setDrugOptions(["Select a drug...", "Other"]);
        }
      })
      .catch((err) => {
        console.error("Failed to load drugs from JSON:", err);
        setDrugOptions(["Select a drug...", "Other"]);
      });

    // Load feature importance for global explanation
    apiFetch<{ features: { feature: string; importance: number }[] }>("/api/predictions/feature-importance")
      .then((res) => {
        if (res.features && res.features.length > 0) {
          setFeatureImportance(res.features);
        }
      })
      .catch((err) => {
        console.error("Failed to load feature importance:", err);
      });

    // Auto-load metrics for Bias Audit tab
    fetch("/metrics.json")
      .then((res) => res.json())
      .then((data) => {
        setMetrics(data);
      })
      .catch((err) => {
        console.error("Failed to load metrics:", err);
      });
  }, [router]);

  // Auto-redirect to ADR Predictions tab only once when a new prediction is made
  const [hasRedirected, setHasRedirected] = useState(false);
  useEffect(() => {
    if (prediction && !hasRedirected && tab !== "ADR Predictions") {
      setTab("ADR Predictions");
      setHasRedirected(true);
      // Smooth scroll to top after tab switch
      setTimeout(() => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }, 150);
    }
  }, [prediction, tab, hasRedirected]);

  // Reset redirect flag when prediction is cleared
  useEffect(() => {
    if (!prediction) {
      setHasRedirected(false);
    }
  }, [prediction]);


  const stats = useMemo(() => {
    const patients = prediction ? 1 : 0;
    const medicationsCount = medications.length;
    const predictions = prediction ? 1 : 0;
    const labs = patientData.lab_creatinine != null ? 1 : 0;
    return { patients, medications: medicationsCount, predictions, labs };
  }, [patientData, prediction, medications]);

  async function runPredictionJSON() {
    setError(null);
    setPredicting(true);
    try {
      // Build comorbidities array from boolean fields for backend compatibility
      const comorbidities: string[] = [];
      if (patientData.hypertension) comorbidities.push("Hypertension");
      if (patientData.diabetes_type1) comorbidities.push("Diabetes Type 1");
      if (patientData.diabetes_type2) comorbidities.push("Diabetes Type 2");
      if (patientData.cad_hf) comorbidities.push("CAD / Heart Failure");
      if (patientData.aki) comorbidities.push("Acute Kidney Injury");
      if (patientData.ckd) comorbidities.push("Chronic Kidney Disease");
      if (patientData.chronic_liver_disease) comorbidities.push("Chronic Liver Disease");
      if (patientData.copd_asthma) comorbidities.push("Asthma / COPD");
      if (patientData.malignancy) comorbidities.push("Malignancy");
      if (patientData.immunosuppressed) comorbidities.push("Immunosuppression");

      // Extract drug names from medications array in exact format (generic names)
      // This matches the format in test_patient_risky.json: ["Acetaminophen", "Cisplatin"]
      // Format: Array of generic drug name strings, exactly as they appear in the dropdown
      const selected_drugs = medications
        .map((m) => m.name)
        .filter((name) => name && typeof name === 'string' && name.trim() !== "")
        .map((name) => name.trim()); // Ensure no extra whitespace, format matches test_patient_risky.json

      console.log("Sending drugs to backend:", selected_drugs); // Debug log

      // Prepare patient data with both formats for compatibility
      const dataToSend = {
        ...patientData,
        selected_drugs, // Array of generic drug names: ["Acetaminophen", "Cisplatin", etc.] - matches test_patient_risky.json format
        medications, // Full medication objects for reference
        comorbidities, // Array format for backend processing
        // Also keep individual boolean fields for direct feature mapping
        hypertension: patientData.hypertension || false,
        diabetes_type1: patientData.diabetes_type1 || false,
        diabetes_type2: patientData.diabetes_type2 || false,
        cad_hf: patientData.cad_hf || false,
        aki: patientData.aki || false,
        ckd: patientData.ckd || false,
        chronic_liver_disease: patientData.chronic_liver_disease || false,
        copd_asthma: patientData.copd_asthma || false,
        malignancy: patientData.malignancy || false,
        immunosuppressed: patientData.immunosuppressed || false
      };

      const res = await apiFetch<PredictionResponse>("/api/predictions/predict", {
        method: "POST",
        json: { patient_data: dataToSend }
      });
      setPrediction(res);
      // Automatically switch to ADR Predictions tab after prediction completes
      setTimeout(() => {
        setTab("ADR Predictions");
        // Smooth scroll to top of predictions section
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }, 100);
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setPredicting(false);
    }
  }

  async function uploadAndPredict(kind: "json" | "csv") {
    if (!uploadFile) return;
    setError(null);
    setPredicting(true);
    try {
      const form = new FormData();
      form.append("file", uploadFile);
      const res = await apiFetch<PredictionResponse>(`/api/predictions/upload?kind=${kind}`, {
        method: "POST",
        body: form
      });
      setPrediction(res);
      // Automatically switch to ADR Predictions tab after prediction completes
      setTimeout(() => {
        setTab("ADR Predictions");
        // Smooth scroll to top of predictions section
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }, 100);
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setPredicting(false);
    }
  }

  async function saveToHistory() {
    if (!prediction) return;
    await apiFetch<RecordOut>("/api/predictions/history", {
      method: "POST",
      json: {
        patient_name: `Patient ${patientData.anchor_age}y/${patientData.gender}`,
        patient_data: patientData,
        prediction_result: prediction,
        clinical_recommendations: (prediction.recommendations || []).join("; ")
      }
    });
    alert("Report saved to history!");
  }

  async function loadHistory() {
    const rows = await apiFetch<RecordOut[]>("/api/predictions/history");
    setHistory(rows);
  }

  async function loadAdmin() {
    const rows = await apiFetch<any[]>("/api/admin/records");
    setAdminRecords(rows);
  }

  async function loadMetrics() {
    const m = await fetch("/metrics.json")
      .then((res) => res.json());
    setMetrics(m);
  }


  function logout() {
    clearAuth();
    router.replace("/auth");
  }

  function submitFeedback() {
    const feedbackData = {
      usefulness: feedbackUsefulness,
      accuracy: feedbackAccuracy,
      response_time: feedbackResponseTime,
      workload_reduction: feedbackWorkloadReduction,
      comments: feedbackComments,
      category: "workflow_efficiency"
    };

    apiFetch<any>("/api/metrics/feedback", {
      method: "POST",
      json: feedbackData
    })
      .then(() => {
        setFeedbackSubmitted(true);
        setFeedbackUsefulness("Moderately Useful");
        setFeedbackAccuracy("Neutral");
        setFeedbackResponseTime("Acceptable");
        setFeedbackWorkloadReduction("Moderate Reduction");
        setFeedbackComments("");
        setTimeout(() => setFeedbackSubmitted(false), 5000);
      })
      .catch((err) => {
        console.error("Failed to submit feedback:", err);
        alert("Failed to submit feedback. Please try again.");
      });
  }

  const isAdmin = user?.role === "admin";

  return (
    <div className="dash-shell">
      <aside className="sidebar">
        <div className="sidebar-title">
          <Image src="/user-Stroke-Rounded.png" alt="User" width={20} height={20} style={{ display: 'inline-block', marginRight: '0.5rem', verticalAlign: 'middle' }} />
          {user?.username || "User"}
        </div>
        <div className="sidebar-caption">Role: {(user?.role || "user").toUpperCase()}</div>

        <div style={{ marginTop: "1rem" }}>
          <button className="sidebar-btn" onClick={logout}>
            Log Out
          </button>
        </div>

        <div style={{ marginTop: "1rem", fontWeight: 700 }}>Navigate</div>
        <div className="sidebar-nav">
          <button className={`sidebar-btn ${view === "dashboard" ? "active" : ""}`} onClick={() => setView("dashboard")}>
            Dashboard
          </button>
          <button className={`sidebar-btn ${view === "history" ? "active" : ""}`} onClick={() => { setView("history"); loadHistory(); }}>
            My History
          </button>
          {isAdmin ? (
            <button className={`sidebar-btn ${view === "admin" ? "active" : ""}`} onClick={() => { setView("admin"); loadAdmin(); }}>
              Admin Panel
            </button>
          ) : null}
        </div>
      </aside>

      <main className="content">
        <div className="app-header-row">
          <div className="app-header-left">
            <div className="app-logo">
              <Image src="/ai-brain-02-Stroke-Rounded.png" alt="AI-CPA" width={32} height={32} style={{ filter: 'brightness(0) invert(1)' }} />
            </div>
            <div>
              <div className="app-title">AI-CPA</div>
              <div className="app-subtitle">Clinical Pharmacist Assistant</div>
            </div>
          </div>
        </div>

        {view === "dashboard" ? (
          <>
            <div className="summary-row">
              <div className="summary-card">
                <div className="summary-title">Total Patients</div>
                <div className="summary-value">{stats.patients}</div>
              </div>
              <div className="summary-card">
                <div className="summary-title">Medications</div>
                <div className="summary-value">{stats.medications}</div>
              </div>
              <div className="summary-card">
                <div className="summary-title">ADR Predictions</div>
                <div className="summary-value">{stats.predictions}</div>
              </div>
              <div className="summary-card">
                <div className="summary-title">Lab Results</div>
                <div className="summary-value">{stats.labs}</div>
              </div>
            </div>

            <div className="tabs-row">
              {tabs.map((t) => (
                <button key={t} className={`tab-pill ${tab === t ? "active" : ""}`} onClick={() => setTab(t)}>
                  {t}
                </button>
              ))}
            </div>

            {error ? <div style={{ color: "#dc2626", marginBottom: "1rem" }}>{error}</div> : null}

            {tab === "Patients" ? (
              <div className="panel">
                <h3 style={{ marginTop: 0 }}>Patient Clinical Data Entry</h3>
                <div style={{ color: "#6B7280", marginBottom: "1rem" }}>
                  Comprehensive assessment for precise ADR prediction.
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
                  <h4 style={{ marginTop: 0, marginBottom: 0 }}>Upload Patient Data</h4>
                </div>
                <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "0.75rem" }}>
                  <button
                    className={`sidebar-btn ${uploadMethod === "manual" ? "active" : ""}`}
                    onClick={() => setUploadMethod("manual")}
                  >
                    Manual Entry
                  </button>
                  <button
                    className={`sidebar-btn ${uploadMethod === "json" ? "active" : ""}`}
                    onClick={() => setUploadMethod("json")}
                  >
                    Upload JSON
                  </button>
                  <button
                    className={`sidebar-btn ${uploadMethod === "csv" ? "active" : ""}`}
                    onClick={() => setUploadMethod("csv")}
                  >
                    Upload CSV
                  </button>
                </div>

                {uploadMethod !== "manual" ? (
                  <div className="risk-box" style={{ marginBottom: "1rem" }}>
                    <input
                      type="file"
                      accept={uploadMethod === "csv" ? ".csv" : ".json"}
                      onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                    />
                    <div style={{ marginTop: "0.75rem" }}>
                      <button
                        className="btn-primary"
                        onClick={() => uploadAndPredict(uploadMethod === "csv" ? "csv" : "json")}
                        disabled={predicting || !uploadFile}
                      >
                        {predicting ? "Running AI Analysis..." : (
                          <>
                            <Image src="/search-01-Stroke-Rounded.png" alt="Search" width={18} height={18} style={{ display: 'inline-block', marginRight: '0.5rem', verticalAlign: 'middle' }} />
                            Predict ADR Risk from {uploadMethod.toUpperCase()}
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                ) : null}

                <details open>
                  <summary style={{ fontWeight: 800, cursor: "pointer" }}>1. Patient Identification & Context</summary>
                  <div style={{ marginTop: "0.75rem" }}>
                    <h4 style={{ marginTop: 0, marginBottom: "0.75rem" }}>Patient Identification</h4>
                    <div className="row2" style={{ marginTop: "0.75rem" }}>
                      <div className="field">
                        <label>Age (years)</label>
                        <input
                          type="number"
                          min="18"
                          max="120"
                          value={patientData.anchor_age}
                          onChange={(e) => setPatientData({ ...patientData, anchor_age: Number(e.target.value) })}
                        />
                      </div>
                      <div className="field">
                        <label>Sex</label>
                        <select
                          value={patientData.gender === "M" ? "Male" : patientData.gender === "F" ? "Female" : "Other"}
                          onChange={(e) => {
                            const val = e.target.value === "Male" ? "M" : e.target.value === "Female" ? "F" : "O";
                            setPatientData({ ...patientData, gender: val });
                          }}
                        >
                          <option value="Male">Male</option>
                          <option value="Female">Female</option>
                          <option value="Other">Other</option>
                        </select>
                      </div>
                      <div className="field">
                        <label>Weight (kg)</label>
                        <input
                          type="number"
                          min="30"
                          max="200"
                          step="0.1"
                          value={patientData.weight}
                          onChange={(e) => setPatientData({ ...patientData, weight: Number(e.target.value) })}
                        />
                      </div>
                      <div className="field">
                        <label>Height (cm)</label>
                        <input
                          type="number"
                          min="100"
                          max="250"
                          step="0.1"
                          value={patientData.height}
                          onChange={(e) => setPatientData({ ...patientData, height: Number(e.target.value) })}
                        />
                      </div>
                    </div>
                    {patientData.height > 0 && (
                      <div style={{ marginTop: "0.5rem", color: "#6B7280" }}>
                        BMI: {((patientData.weight / ((patientData.height / 100) ** 2))).toFixed(1)}
                      </div>
                    )}
                  </div>
                  <div style={{ marginTop: "1.5rem" }}>
                    <h4 style={{ marginTop: 0, marginBottom: "0.75rem" }}>Care Setting</h4>
                    <div className="row2" style={{ marginTop: "0.75rem" }}>
                      <div className="field">
                        <label>Admission Type</label>
                        <select
                          value={patientData.admission_type}
                          onChange={(e) => setPatientData({ ...patientData, admission_type: e.target.value })}
                        >
                          <option value="Inpatient">Inpatient</option>
                          <option value="OPD">OPD</option>
                          <option value="ICU">ICU</option>
                          <option value="Emergency">Emergency</option>
                        </select>
                      </div>
                      <div className="field">
                        <label>Ward Type</label>
                        <select
                          value={patientData.ward}
                          onChange={(e) => setPatientData({ ...patientData, ward: e.target.value })}
                        >
                          <option value="General Ward">General Ward</option>
                          <option value="HDU">HDU</option>
                          <option value="ICU">ICU</option>
                          <option value="Private">Private</option>
                        </select>
                      </div>
                    </div>
                  </div>
                </details>

                <details>
                  <summary style={{ fontWeight: 800, cursor: "pointer" }}>2. Clinical Vitals & Organ Status</summary>
                  <div style={{ marginTop: "0.75rem" }}>
                    <h4 style={{ marginTop: 0, marginBottom: "0.75rem" }}>Hemodynamics & Vitals</h4>
                    <div className="row2" style={{ marginTop: "0.75rem" }}>
                      <div className="field">
                        <label>Systolic BP (mmHg)</label>
                        <input
                          type="number"
                          min="50"
                          max="250"
                          value={patientData.vital_arterial_blood_pressure_systolic}
                          onChange={(e) => {
                            const sbp = Number(e.target.value);
                            const dbp = patientData.vital_arterial_blood_pressure_diastolic || 80;
                            const map = (sbp + (2 * dbp)) / 3;
                            setPatientData({
                              ...patientData,
                              vital_arterial_blood_pressure_systolic: sbp,
                              vital_arterial_blood_pressure_mean: map
                            });
                          }}
                        />
                      </div>
                      <div className="field">
                        <label>Diastolic BP (mmHg)</label>
                        <input
                          type="number"
                          min="30"
                          max="150"
                          value={patientData.vital_arterial_blood_pressure_diastolic}
                          onChange={(e) => {
                            const dbp = Number(e.target.value);
                            const sbp = patientData.vital_arterial_blood_pressure_systolic || 120;
                            const map = (sbp + (2 * dbp)) / 3;
                            setPatientData({
                              ...patientData,
                              vital_arterial_blood_pressure_diastolic: dbp,
                              vital_arterial_blood_pressure_mean: map
                            });
                          }}
                        />
                      </div>
                      <div className="field">
                        <label>Mean Arterial Pressure</label>
                        <div style={{ padding: "0.5rem", background: "#f3f4f6", borderRadius: "4px", color: "#6B7280" }}>
                          {patientData.vital_arterial_blood_pressure_mean?.toFixed(1) || "93.3"} mmHg
                        </div>
                      </div>
                      <div className="field">
                        <label>Heart Rate (bpm)</label>
                        <input
                          type="number"
                          min="30"
                          max="200"
                          value={patientData.vital_heart_rate}
                          onChange={(e) => setPatientData({ ...patientData, vital_heart_rate: Number(e.target.value) })}
                        />
                      </div>
                      <div className="field">
                        <label>Resp. Rate (bpm)</label>
                        <input
                          type="number"
                          min="8"
                          max="60"
                          value={patientData.vital_respiratory_rate}
                          onChange={(e) =>
                            setPatientData({ ...patientData, vital_respiratory_rate: Number(e.target.value) })
                          }
                        />
                      </div>
                      <div className="field">
                        <label>Temperature (°C)</label>
                        <input
                          type="number"
                          min="32"
                          max="42"
                          step="0.1"
                          value={patientData.vital_temperature_celsius}
                          onChange={(e) =>
                            setPatientData({ ...patientData, vital_temperature_celsius: Number(e.target.value) })
                          }
                        />
                      </div>
                      <div className="field">
                        <label>SpO2 (%)</label>
                        <input
                          type="number"
                          min="50"
                          max="100"
                          value={patientData.vital_spo2}
                          onChange={(e) => setPatientData({ ...patientData, vital_spo2: Number(e.target.value) })}
                        />
                      </div>
                    </div>
                  </div>
                  <div style={{ marginTop: "1.5rem" }}>
                    <h4 style={{ marginTop: 0, marginBottom: "0.75rem" }}>Organ Support</h4>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "0.5rem" }}>
                      <label style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                        <input
                          type="checkbox"
                          checked={Boolean(patientData.on_oxygen)}
                          onChange={(e) => setPatientData({ ...patientData, on_oxygen: e.target.checked })}
                        />
                        Oxygen Therapy
                      </label>
                      <label style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                        <input
                          type="checkbox"
                          checked={Boolean(patientData.on_ventilator)}
                          onChange={(e) => setPatientData({ ...patientData, on_ventilator: e.target.checked })}
                        />
                        Mechanical Ventilation
                      </label>
                      <label style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                        <input
                          type="checkbox"
                          checked={Boolean(patientData.on_dialysis)}
                          onChange={(e) => setPatientData({ ...patientData, on_dialysis: e.target.checked })}
                        />
                        Dialysis / CRRT
                      </label>
                      <label style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                        <input
                          type="checkbox"
                          checked={Boolean(patientData.on_vasopressors)}
                          onChange={(e) => setPatientData({ ...patientData, on_vasopressors: e.target.checked })}
                        />
                        Vasopressor Support
                      </label>
                    </div>
                  </div>
                </details>

                <details>
                  <summary style={{ fontWeight: 800, cursor: "pointer" }}>3. Laboratory Results (ADR-Relevant)</summary>
                  <div style={{ marginTop: "0.75rem" }}>
                    <h4 style={{ marginTop: 0, marginBottom: "0.75rem" }}>Hematology</h4>
                    <div className="row2" style={{ marginTop: "0.75rem" }}>
                      <div className="field">
                        <label>Hemoglobin (g/dL)</label>
                        <input
                          type="number"
                          min="0"
                          max="25"
                          step="0.1"
                          value={patientData.lab_hemoglobin}
                          onChange={(e) => setPatientData({ ...patientData, lab_hemoglobin: Number(e.target.value) })}
                        />
                        <small style={{ color: "#6B7280" }}>Normal: 12-16 (F), 13.5-17.5 (M)</small>
                      </div>
                      <div className="field">
                        <label>WBC Count (K/uL)</label>
                        <input
                          type="number"
                          min="0"
                          max="50"
                          step="0.1"
                          value={patientData.lab_white_blood_cells}
                          onChange={(e) => setPatientData({ ...patientData, lab_white_blood_cells: Number(e.target.value) })}
                        />
                        <small style={{ color: "#6B7280" }}>Normal: 4.5-11.0</small>
                      </div>
                      <div className="field">
                        <label>Platelets (K/uL)</label>
                        <input
                          type="number"
                          min="0"
                          max="1000"
                          step="0.1"
                          value={patientData.lab_platelet_count}
                          onChange={(e) => setPatientData({ ...patientData, lab_platelet_count: Number(e.target.value) })}
                        />
                        <small style={{ color: "#6B7280" }}>Normal: 150-450</small>
                      </div>
                    </div>
                  </div>
                  <div style={{ marginTop: "1.5rem" }}>
                    <h4 style={{ marginTop: 0, marginBottom: "0.75rem" }}>Renal & Electrolytes</h4>
                    <div className="row2" style={{ marginTop: "0.75rem" }}>
                      <div className="field">
                        <label>Creatinine (mg/dL)</label>
                        <input
                          type="number"
                          min="0"
                          max="15"
                          step="0.1"
                          value={patientData.lab_creatinine}
                          onChange={(e) => setPatientData({ ...patientData, lab_creatinine: Number(e.target.value) })}
                        />
                      </div>
                      <div className="field">
                        <label>eGFR (mL/min)</label>
                        <input
                          type="number"
                          min="0"
                          max="140"
                          value={patientData.lab_egfr}
                          onChange={(e) => setPatientData({ ...patientData, lab_egfr: Number(e.target.value) })}
                        />
                      </div>
                      <div className="field">
                        <label>Sodium (mEq/L)</label>
                        <input
                          type="number"
                          min="100"
                          max="180"
                          value={patientData.lab_sodium}
                          onChange={(e) => setPatientData({ ...patientData, lab_sodium: Number(e.target.value) })}
                        />
                      </div>
                      <div className="field">
                        <label>Potassium (mEq/L)</label>
                        <input
                          type="number"
                          min="1"
                          max="10"
                          step="0.1"
                          value={patientData.lab_potassium}
                          onChange={(e) => setPatientData({ ...patientData, lab_potassium: Number(e.target.value) })}
                        />
                      </div>
                      <div className="field">
                        <label>Calcium (mg/dL)</label>
                        <input
                          type="number"
                          min="0"
                          max="20"
                          step="0.1"
                          value={patientData.lab_calcium_total}
                          onChange={(e) => setPatientData({ ...patientData, lab_calcium_total: Number(e.target.value) })}
                        />
                      </div>
                      <div className="field">
                        <label>Magnesium (mg/dL)</label>
                        <input
                          type="number"
                          min="0"
                          max="10"
                          step="0.1"
                          value={patientData.lab_magnesium}
                          onChange={(e) => setPatientData({ ...patientData, lab_magnesium: Number(e.target.value) })}
                        />
                      </div>
                    </div>
                  </div>
                  <div style={{ marginTop: "1.5rem" }}>
                    <h4 style={{ marginTop: 0, marginBottom: "0.75rem" }}>Liver Function</h4>
                    <div className="row2" style={{ marginTop: "0.75rem" }}>
                      <div className="field">
                        <label>ALT (U/L)</label>
                        <input
                          type="number"
                          min="0"
                          max="1000"
                          value={patientData.lab_alt}
                          onChange={(e) => setPatientData({ ...patientData, lab_alt: Number(e.target.value) })}
                        />
                      </div>
                      <div className="field">
                        <label>AST (U/L)</label>
                        <input
                          type="number"
                          min="0"
                          max="1000"
                          value={patientData.lab_ast}
                          onChange={(e) => setPatientData({ ...patientData, lab_ast: Number(e.target.value) })}
                        />
                      </div>
                      <div className="field">
                        <label>ALP (U/L)</label>
                        <input
                          type="number"
                          min="0"
                          max="1000"
                          value={patientData.lab_alp}
                          onChange={(e) => setPatientData({ ...patientData, lab_alp: Number(e.target.value) })}
                        />
                      </div>
                      <div className="field">
                        <label>Total Bilirubin (mg/dL)</label>
                        <input
                          type="number"
                          min="0"
                          max="30"
                          step="0.1"
                          value={patientData.lab_bilirubin}
                          onChange={(e) => setPatientData({ ...patientData, lab_bilirubin: Number(e.target.value) })}
                        />
                      </div>
                    </div>
                  </div>
                </details>

                <details>
                  <summary style={{ fontWeight: 800, cursor: "pointer" }}>4. Comorbidities (Structured)</summary>
                  <div style={{ marginTop: "0.75rem", display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "1rem" }}>
                    <div>
                      <h4 style={{ marginTop: 0, marginBottom: "0.75rem", fontSize: "0.9rem" }}>Cardiometabolic</h4>
                      <div style={{ display: "grid", gap: "0.5rem" }}>
                        <label style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                          <input
                            type="checkbox"
                            checked={Boolean(patientData.hypertension)}
                            onChange={(e) => setPatientData({ ...patientData, hypertension: e.target.checked })}
                          />
                          Hypertension
                        </label>
                        <label style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                          <input
                            type="checkbox"
                            checked={Boolean(patientData.diabetes_type1) || Boolean(patientData.diabetes_type2)}
                            onChange={(e) => {
                              if (!e.target.checked) {
                                setPatientData({ ...patientData, diabetes_type1: false, diabetes_type2: false });
                              }
                            }}
                          />
                          Diabetes Mellitus
                        </label>
                        {Boolean(patientData.diabetes_type1) || Boolean(patientData.diabetes_type2) ? (
                          <select
                            value={patientData.diabetes_type1 ? "Type 1" : "Type 2"}
                            onChange={(e) =>
                              setPatientData({
                                ...patientData,
                                diabetes_type1: e.target.value === "Type 1",
                                diabetes_type2: e.target.value === "Type 2"
                              })
                            }
                            style={{ marginLeft: "1.5rem", padding: "0.25rem" }}
                          >
                            <option value="Type 1">Type 1</option>
                            <option value="Type 2">Type 2</option>
                          </select>
                        ) : null}
                        <label style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                          <input
                            type="checkbox"
                            checked={Boolean(patientData.cad_hf)}
                            onChange={(e) => setPatientData({ ...patientData, cad_hf: e.target.checked })}
                          />
                          CAD / Heart Failure
                        </label>
                      </div>
                      <h4 style={{ marginTop: "1rem", marginBottom: "0.75rem", fontSize: "0.9rem" }}>Respiratory</h4>
                      <div style={{ display: "grid", gap: "0.5rem" }}>
                        <label style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                          <input
                            type="checkbox"
                            checked={Boolean(patientData.copd_asthma)}
                            onChange={(e) => setPatientData({ ...patientData, copd_asthma: e.target.checked })}
                          />
                          Asthma / COPD
                        </label>
                      </div>
                    </div>
                    <div>
                      <h4 style={{ marginTop: 0, marginBottom: "0.75rem", fontSize: "0.9rem" }}>Renal & Hepatic</h4>
                      <div style={{ display: "grid", gap: "0.5rem" }}>
                        <label style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                          <input
                            type="checkbox"
                            checked={Boolean(patientData.aki)}
                            onChange={(e) => setPatientData({ ...patientData, aki: e.target.checked })}
                          />
                          Acute Kidney Injury (AKI)
                        </label>
                        <label style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                          <input
                            type="checkbox"
                            checked={Boolean(patientData.ckd)}
                            onChange={(e) => setPatientData({ ...patientData, ckd: e.target.checked })}
                          />
                          Chronic Kidney Disease (CKD)
                        </label>
                        <label style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                          <input
                            type="checkbox"
                            checked={Boolean(patientData.chronic_liver_disease)}
                            onChange={(e) => setPatientData({ ...patientData, chronic_liver_disease: e.target.checked })}
                          />
                          Chronic Liver Disease
                        </label>
                      </div>
                      <h4 style={{ marginTop: "1rem", marginBottom: "0.75rem", fontSize: "0.9rem" }}>Other</h4>
                      <div style={{ display: "grid", gap: "0.5rem" }}>
                        <label style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                          <input
                            type="checkbox"
                            checked={Boolean(patientData.malignancy)}
                            onChange={(e) => setPatientData({ ...patientData, malignancy: e.target.checked })}
                          />
                          Malignancy
                        </label>
                        <label style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                          <input
                            type="checkbox"
                            checked={Boolean(patientData.immunosuppressed)}
                            onChange={(e) => setPatientData({ ...patientData, immunosuppressed: e.target.checked })}
                          />
                          Immunosuppression
                        </label>
                      </div>
                    </div>
                  </div>
                </details>

                <details open style={{ marginTop: "1rem" }}>
                  <summary style={{ fontWeight: 800, cursor: "pointer" }}>5. Medication Profile (MOST IMPORTANT)</summary>
                  <div style={{ marginTop: "0.75rem" }}>
                    <div style={{ color: "#6B7280", marginBottom: "1rem", fontSize: "0.9rem" }}>
                      Add each medication separately.
                    </div>

                    <div style={{ border: "1px solid #e5e7eb", borderRadius: "8px", padding: "1rem", background: "#f9fafb" }}>
                      <div className="row2" style={{ marginBottom: "0.75rem" }}>
                        <div className="field">
                          <label>Generic Name</label>
                          <select
                            value={selectedDrug}
                            onChange={(e) => {
                              setSelectedDrug(e.target.value);
                              if (e.target.value === "Other") {
                                // Will show manual input below
                              }
                            }}
                            style={{
                              width: "300px",
                              maxWidth: "300px"
                            }}
                          >
                            {drugOptions.length > 0 ? (
                              drugOptions.map((drug) => (
                                <option key={drug} value={drug}>
                                  {drug}
                                </option>
                              ))
                            ) : (
                              <option value="">Loading drugs...</option>
                            )}
                          </select>
                          {drugOptions.length <= 2 && drugOptions.length > 0 && (
                            <small style={{ color: "#dc2626", display: "block", marginTop: "0.25rem", maxWidth: "100px" }}>
                              Failed to load drug list. You can still enter drugs manually by selecting "Other".
                            </small>
                          )}
                        </div>
                        <div className="field">
                          <label>Dose (e.g., 500mg)</label>
                          <input
                            value={drugDose}
                            onChange={(e) => setDrugDose(e.target.value)}
                            placeholder="e.g., 500mg"
                          />
                        </div>
                      </div>

                      {selectedDrug === "Other" && (
                        <div className="field" style={{ marginBottom: "0.75rem" }}>
                          <label>Enter Drug Name Manually</label>
                          <input
                            value={manualDrugName}
                            onChange={(e) => setManualDrugName(e.target.value)}
                            placeholder="Enter drug name"
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                // Allow Enter to submit the form
                              }
                            }}
                          />
                        </div>
                      )}

                      <div className="row2" style={{ marginBottom: "0.75rem" }}>
                        <div className="field">
                          <label>Route</label>
                          <select
                            value={drugRoute}
                            onChange={(e) => setDrugRoute(e.target.value)}
                            style={{ width: "100%" }}
                          >
                            <option value="PO (Oral)">PO (Oral)</option>
                            <option value="IV">IV</option>
                            <option value="IM">IM</option>
                            <option value="SC">SC</option>
                            <option value="Topical">Topical</option>
                          </select>
                        </div>
                        <div className="field">
                          <label>Frequency</label>
                          <select
                            value={drugFreq}
                            onChange={(e) => setDrugFreq(e.target.value)}
                            style={{ width: "100%" }}
                          >
                            <option value="OD">OD</option>
                            <option value="BD">BD</option>
                            <option value="TDS">TDS</option>
                            <option value="QID">QID</option>
                            <option value="HS">HS</option>
                            <option value="STAT">STAT</option>
                          </select>
                        </div>
                      </div>

                      <div className="row2" style={{ marginBottom: "0.75rem" }}>
                        <div className="field">
                          <label>Duration (days)</label>
                          <input
                            type="number"
                            min="0"
                            max="365"
                            value={drugDuration}
                            onChange={(e) => setDrugDuration(Number(e.target.value))}
                            placeholder="Expected treatment duration"
                          />
                        </div>
                        <div className="field">
                          <label>Start Date</label>
                          <input
                            type="date"
                            value={drugStartDate}
                            onChange={(e) => setDrugStartDate(e.target.value)}
                          />
                        </div>
                      </div>

                      <div style={{ marginBottom: "0.75rem" }}>
                        <label style={{ fontWeight: 600, marginBottom: "0.5rem", display: "block" }}>Special Flags:</label>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "0.5rem" }}>
                          <label style={{ display: "flex", gap: "0.5rem", alignItems: "center", fontSize: "0.9rem" }}>
                            <input
                              type="checkbox"
                              checked={drugNarrowTI}
                              onChange={(e) => setDrugNarrowTI(e.target.checked)}
                            />
                            Narrow Therapeutic Index
                          </label>
                          <label style={{ display: "flex", gap: "0.5rem", alignItems: "center", fontSize: "0.9rem" }}>
                            <input
                              type="checkbox"
                              checked={drugNephrotoxic}
                              onChange={(e) => setDrugNephrotoxic(e.target.checked)}
                            />
                            Nephrotoxic
                          </label>
                          <label style={{ display: "flex", gap: "0.5rem", alignItems: "center", fontSize: "0.9rem" }}>
                            <input
                              type="checkbox"
                              checked={drugHepatotoxic}
                              onChange={(e) => setDrugHepatotoxic(e.target.checked)}
                            />
                            Hepatotoxic
                          </label>
                          <label style={{ display: "flex", gap: "0.5rem", alignItems: "center", fontSize: "0.9rem" }}>
                            <input
                              type="checkbox"
                              checked={drugQTProlonging}
                              onChange={(e) => setDrugQTProlonging(e.target.checked)}
                            />
                            QT-prolonging
                          </label>
                        </div>
                      </div>

                      <label style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginBottom: "0.75rem" }}>
                        <input
                          type="checkbox"
                          checked={drugHighRisk}
                          onChange={(e) => setDrugHighRisk(e.target.checked)}
                        />
                        <span style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem" }}>
                          <Image src="/security-lock-Stroke-Rounded.png" alt="Warning" width={16} height={16} style={{ display: "inline-block", verticalAlign: "middle" }} />
                          High Risk / Narrow Therapeutic Index
                        </span>
                      </label>

                      <button
                        className="btn-primary"
                        onClick={() => {
                          // Get drug name - use exact format from dropdown (generic name)
                          // This ensures it matches the format in test_patient_risky.json (e.g., "Acetaminophen", "Cisplatin")
                          let drugName: string = "";
                          if (selectedDrug === "Other") {
                            // For manual entry, trim and use as-is (user should enter generic name)
                            drugName = manualDrugName.trim();
                          } else if (selectedDrug && selectedDrug !== "Select a drug...") {
                            // Use the exact generic name from dropdown (already in correct format: "Acetaminophen", "Cisplatin", etc.)
                            drugName = selectedDrug; // No need to trim or normalize - dropdown already has correct format
                          }

                          if (!drugName) {
                            setError("Please select or enter a drug name");
                            return;
                          }

                          // Create medication object with exact generic name format (matches test_patient_risky.json)
                          const newMed = {
                            name: drugName, // Exact generic name format: "Acetaminophen", "Cisplatin", etc.
                            dose: drugDose,
                            route: drugRoute,
                            freq: drugFreq,
                            duration_days: drugDuration,
                            start_date: drugStartDate || null,
                            narrow_therapeutic_index: drugNarrowTI,
                            nephrotoxic: drugNephrotoxic,
                            hepatotoxic: drugHepatotoxic,
                            qt_prolonging: drugQTProlonging,
                            high_risk: drugHighRisk
                          };

                          setMedications([...medications, newMed]);
                          setSelectedDrug("Select a drug...");
                          setManualDrugName("");
                          setDrugDose("");
                          setDrugRoute("PO (Oral)");
                          setDrugFreq("OD");
                          setDrugDuration(0);
                          setDrugStartDate("");
                          setDrugNarrowTI(false);
                          setDrugNephrotoxic(false);
                          setDrugHepatotoxic(false);
                          setDrugQTProlonging(false);
                          setDrugHighRisk(false);
                          setError(null);
                        }}
                      >
                        <Image src="/plus-sign-square-Stroke-Rounded.png" alt="Add" width={18} height={18} style={{ display: 'inline-block', marginRight: '0.5rem', verticalAlign: 'middle' }} />
                        Add Drug
                      </button>
                    </div>

                    {medications.length > 0 && (
                      <div style={{ marginTop: "1.5rem" }}>
                        <b>Current Medications ({medications.length})</b>
                        <div style={{ marginTop: "0.5rem", display: "grid", gap: "0.5rem" }}>
                          {medications.map((med, idx) => {
                            const flags = [];
                            if (med.narrow_therapeutic_index) flags.push("NTI");
                            if (med.nephrotoxic) flags.push("Nephro");
                            if (med.hepatotoxic) flags.push("Hepato");
                            if (med.qt_prolonging) flags.push("QT");

                            return (
                              <div key={idx} style={{ display: "flex", justifyContent: "space-between", gap: "0.75rem", alignItems: "center", padding: "0.75rem", background: "#ffffff", border: "1px solid #e5e7eb", borderRadius: "6px" }}>
                                <div style={{ flex: 1 }}>
                                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.25rem" }}>
                                    {med.high_risk ? (
                                      <Image src="/security-lock-Stroke-Rounded.png" alt="Warning" width={16} height={16} style={{ display: "inline-block", verticalAlign: "middle", filter: "invert(28%) sepia(84%) saturate(6571%) hue-rotate(344deg) brightness(93%) contrast(90%)" }} />
                                    ) : (
                                      <Image src="/medicine-02-Stroke-Rounded.png" alt="Medicine" width={18} height={18} style={{ display: 'inline-block', verticalAlign: 'middle' }} />
                                    )}
                                    <strong>{med.name}</strong>
                                    {med.dose && <span>{med.dose}</span>}
                                    <span style={{ color: "#6B7280" }}>via {med.route} ({med.freq})</span>
                                  </div>
                                  <div style={{ fontSize: "0.85rem", color: "#6B7280", marginLeft: "1.75rem" }}>
                                    {med.duration_days > 0 && <span>Duration: {med.duration_days} days</span>}
                                    {med.start_date && <span style={{ marginLeft: "0.5rem" }}>| Started: {med.start_date}</span>}
                                    {flags.length > 0 && <span style={{ marginLeft: "0.5rem" }}>| Flags: {flags.join(", ")}</span>}
                                  </div>
                                </div>
                                <button
                                  className="sidebar-btn"
                                  onClick={() => {
                                    setMedications(medications.filter((_, i) => i !== idx));
                                  }}
                                  style={{ padding: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                >
                                  <Image src="/cancel-square-Stroke-Rounded.png" alt="Remove" width={18} height={18} />
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </details>

                <div style={{ marginTop: "1.25rem" }}>
                  <button className="btn-primary" onClick={runPredictionJSON} disabled={predicting}>
                    {predicting ? "Running AI Analysis..." : (
                      <>
                        <Image src="/rocket-01-Stroke-Rounded.png" alt="Predict" width={18} height={18} style={{ display: 'inline-block', marginRight: '0.5rem', verticalAlign: 'middle' }} />
                        Predict ADR Risk
                      </>
                    )}
                  </button>
                </div>
              </div>
            ) : null}

            {tab === "ADR Predictions" ? (
              <div className="panel">
                {!prediction ? (
                  <div>No prediction yet. Go to Patients tab and run a prediction first.</div>
                ) : (
                  <>
                    <h3 style={{ marginTop: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <Image src="/target-02-Stroke-Rounded.png" alt="Target" width={24} height={24} />
                      Real-time ADR Risk Prediction
                    </h3>
                    <div className="row2">
                      <div>
                        <RiskGauge riskScore={prediction.risk_score} />
                      </div>
                      <div className="risk-box" style={{ borderLeft: `5px solid ${prediction.risk_category === "High" ? "#dc3545" : prediction.risk_category === "Moderate" ? "#fd7e14" : "#28a745"}` }}>
                        <h2 style={{ margin: 0 }}>
                          Risk Level: {prediction.risk_category}
                        </h2>
                        <div style={{ fontSize: "1.2rem", fontWeight: 800, marginTop: "0.5rem" }}>
                          ADR Risk Score:{" "}
                          {(prediction.risk_score * 100) < 0.1
                            ? `${(prediction.risk_score * 100).toFixed(4)}%`
                            : `${(prediction.risk_score * 100).toFixed(1)}%`}
                        </div>
                        <div style={{ color: "#6B7280", marginTop: "0.5rem" }}>
                          Based on {medications.length} {medications.length === 1 ? 'medication' : 'medications'} and current lab values
                        </div>
                      </div>
                    </div>

                    <hr style={{ margin: "1rem 0" }} />
                    <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <Image src="/medicine-02-Stroke-Rounded.png" alt="Medicine" width={24} height={24} />
                      Drug-Specific ADR Analysis
                    </h3>
                    {prediction.drug_analysis?.top_drugs?.length ? (
                      <div>
                        {prediction.drug_analysis.top_drugs.map((item: any, idx: number) => (
                          <div key={idx} style={{ marginBottom: "0.5rem" }}>
                            <b>{item[0]}</b> — ADR: {(item[1].adr_rate * 100).toFixed(3)}% | Severe:{" "}
                            {(item[1].severe_rate * 100).toFixed(2)}%{" "}
                            {typeof item[1].count === "number" ? `| Count: ${item[1].count}` : ""}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div>No medications selected.</div>
                    )}

                    <hr style={{ margin: "1rem 0" }} />
                    <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <Image src="/microscope-Stroke-Rounded.png" alt="Microscope" width={24} height={24} />
                      Model Explanation (SHAP)
                    </h3>
                    {prediction.shap_top_contributors?.length ? (
                      <div style={{ marginTop: "1rem" }}>
                        <div style={{
                          padding: "1rem",
                          background: "#f9fafb",
                          borderRadius: "8px",
                          border: "1px solid #e5e7eb",
                          overflowX: "auto"
                        }}>
                          <table style={{ width: "100%", borderCollapse: "collapse" }}>
                            <thead>
                              <tr style={{ borderBottom: "2px solid #e5e7eb" }}>
                                <th style={{ padding: "0.75rem", textAlign: "left", fontWeight: 600, color: "#1f2937", fontSize: "0.9rem" }}>Feature</th>
                                <th style={{ padding: "0.75rem", textAlign: "right", fontWeight: 600, color: "#1f2937", fontSize: "0.9rem" }}>SHAP Value</th>
                                <th style={{ padding: "0.75rem", textAlign: "center", fontWeight: 600, color: "#1f2937", fontSize: "0.9rem" }}>Impact</th>
                              </tr>
                            </thead>
                            <tbody>
                              {prediction.shap_top_contributors.slice(0, 10).map((c, idx) => {
                                const isPositive = c.shap_value > 0;
                                const featureName = c.feature
                                  .replace(/_/g, " ")
                                  .replace(/\b\w/g, (l: string) => l.toUpperCase());

                                return (
                                  <tr key={idx} style={{ borderBottom: "1px solid #f3f4f6" }}>
                                    <td style={{ padding: "0.75rem", color: "#1f2937", fontSize: "0.9rem", fontWeight: 500 }}>{featureName}</td>
                                    <td style={{ padding: "0.75rem", textAlign: "right", fontWeight: 600, fontSize: "0.9rem", color: isPositive ? "#dc2626" : "#16a34a" }}>
                                      {isPositive ? "+" : ""}{c.shap_value.toFixed(4)}
                                    </td>
                                    <td style={{ padding: "0.75rem", textAlign: "center" }}>
                                      <span style={{
                                        padding: "0.25rem 0.75rem",
                                        borderRadius: "4px",
                                        fontSize: "0.85rem",
                                        background: isPositive ? "#fef2f2" : "#f0fdf4",
                                        color: isPositive ? "#dc2626" : "#16a34a",
                                        fontWeight: 600
                                      }}>
                                        {isPositive ? "Increases Risk" : "Decreases Risk"}
                                      </span>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                        <div style={{
                          marginTop: "0.75rem",
                          padding: "0.75rem",
                          background: "#f0f9ff",
                          borderRadius: "6px",
                          borderLeft: "3px solid #2563EB",
                          fontSize: "0.85rem",
                          color: "#6B7280"
                        }}>
                          <strong style={{ color: "#1E40AF" }}>Note:</strong> Positive SHAP values increase ADR risk, while negative values decrease risk. Values are sorted by absolute magnitude.
                        </div>
                      </div>
                    ) : (
                      <div style={{
                        padding: "1rem",
                        background: "#fffbeb",
                        borderRadius: "8px",
                        borderLeft: "4px solid #f59e0b",
                        color: "#92400e",
                        fontSize: "0.9rem"
                      }}>
                        SHAP values unavailable. This may occur if the explainer is not properly loaded or feature data is incomplete.
                      </div>
                    )}

                    <hr style={{ margin: "1rem 0" }} />
                    <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <Image src="/hospital-02-Stroke-Rounded.png" alt="Hospital" width={24} height={24} />
                      Clinical Recommendations
                    </h3>
                    {(prediction.recommendations && prediction.recommendations.length > 0) ? (
                      <div
                        className="clinical-recommendations"
                        style={{
                          padding: "1rem",
                          background: "#F0F9FF",
                          borderRadius: "8px",
                          borderLeft: "4px solid #2563EB",
                          color: "#374151",
                          fontSize: "0.95rem",
                          lineHeight: "1.6"
                        }}
                      >
                        {prediction.recommendations.map((r, idx) => {
                          // Process each recommendation string
                          const processRecommendation = (text: string) => {
                            // Split by lines to handle multiline recommendations
                            const lines = text.split('\n').filter(line => line.trim());

                            return lines.map((line, lineIdx) => {
                              let processed = line.trim();

                              // Handle **bold** text (e.g., **HIGH RISK**:)
                              const boldRegex = /\*\*(.+?)\*\*/g;
                              const boldParts: Array<{ type: 'text' | 'bold'; content: string }> = [];
                              let lastIndex = 0;
                              let match;

                              while ((match = boldRegex.exec(processed)) !== null) {
                                if (match.index > lastIndex) {
                                  boldParts.push({ type: 'text', content: processed.substring(lastIndex, match.index) });
                                }
                                boldParts.push({ type: 'bold', content: match[1] });
                                lastIndex = match.index + match[0].length;
                              }

                              if (lastIndex < processed.length) {
                                boldParts.push({ type: 'text', content: processed.substring(lastIndex) });
                              }

                              // Handle bullet points (• at start of line)
                              const isBullet = processed.startsWith('•') || processed.startsWith('-');
                              const content = isBullet ? processed.replace(/^[•\-]\s*/, '') : processed;

                              // Check if it's a section header (ends with colon and has bold)
                              const isHeader = content.endsWith(':') && boldParts.some(p => p.type === 'bold');

                              if (isBullet && !isHeader) {
                                return (
                                  <div key={lineIdx} style={{ display: "flex", alignItems: "flex-start", gap: "0.5rem", marginBottom: "0.5rem" }}>
                                    <span style={{ color: "#2563EB", fontWeight: "bold", marginTop: "0.2rem", flexShrink: 0 }}>•</span>
                                    <span>
                                      {boldParts.length > 0 ? (
                                        boldParts.map((part, partIdx) =>
                                          part.type === 'bold' ? (
                                            <strong key={partIdx} style={{ color: "#1E40AF", fontWeight: 600 }}>{part.content}</strong>
                                          ) : (
                                            <span key={partIdx}>{part.content}</span>
                                          )
                                        )
                                      ) : (
                                        <span>{content}</span>
                                      )}
                                    </span>
                                  </div>
                                );
                              } else if (isHeader) {
                                return (
                                  <div key={lineIdx} style={{ marginTop: lineIdx === 0 ? "0" : "0.75rem", marginBottom: "0.5rem" }}>
                                    {boldParts.map((part, partIdx) =>
                                      part.type === 'bold' ? (
                                        <strong key={partIdx} style={{ color: "#1E40AF", fontWeight: 700, display: "block", marginBottom: "0.25rem" }}>{part.content}:</strong>
                                      ) : (
                                        part.content && <span key={partIdx}>{part.content}</span>
                                      )
                                    )}
                                  </div>
                                );
                              } else {
                                return (
                                  <div key={lineIdx} style={{ marginBottom: "0.5rem" }}>
                                    {boldParts.length > 0 ? (
                                      boldParts.map((part, partIdx) =>
                                        part.type === 'bold' ? (
                                          <strong key={partIdx} style={{ color: "#DC2626", fontWeight: 700 }}>{part.content}</strong>
                                        ) : (
                                          <span key={partIdx}>{part.content}</span>
                                        )
                                      )
                                    ) : (
                                      <span>{content}</span>
                                    )}
                                  </div>
                                );
                              }
                            });
                          };

                          return (
                            <div key={idx}>
                              {processRecommendation(r)}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div style={{
                        color: "#6B7280",
                        fontStyle: "italic",
                        padding: "0.5rem"
                      }}>
                        No specific clinical recommendations at this time.
                      </div>
                    )}

                    {prediction.ai_recommendations_md ? (
                      <>
                        <hr style={{ margin: "1rem 0" }} />
                        <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <Image src="/robot-02-Stroke-Rounded.png" alt="AI" width={24} height={24} />
                          AI Pharmacist Insights (Powered by Gemini)
                        </h3>
                        <div
                          className="ai-recommendations"
                          style={{
                            fontFamily: "inherit",
                            lineHeight: "1.8",
                            color: "#374151",
                            fontSize: "0.95rem"
                          }}
                          dangerouslySetInnerHTML={{ __html: renderMarkdown(prediction.ai_recommendations_md) }}
                        />
                        <style dangerouslySetInnerHTML={{
                          __html: `
                          .ai-recommendations ul {
                            list-style: none;
                            padding-left: 0;
                            margin: 1rem 0;
                          }
                          .ai-recommendations li {
                            margin: 0.75rem 0;
                            padding-left: 1.5rem;
                            position: relative;
                          }
                          .ai-recommendations li::before {
                            content: "•";
                            position: absolute;
                            left: 0;
                            color: #2563EB;
                            font-weight: bold;
                            font-size: 1.2rem;
                          }
                          .ai-recommendations strong {
                            color: #1E40AF;
                            font-weight: 600;
                          }
                          .ai-recommendations p {
                            margin: 0.5rem 0;
                          }
                        `}} />
                      </>
                    ) : null}

                    <div style={{ marginTop: "1rem" }}>
                      <button className="btn-primary" onClick={saveToHistory}>
                        <Image src="/floppy-disk-Stroke-Rounded.png" alt="Save" width={18} height={18} style={{ display: 'inline-block', marginRight: '0.5rem', verticalAlign: 'middle' }} />
                        Save to History
                      </button>
                    </div>
                  </>
                )}
              </div>
            ) : null}

            {tab === "Explainability" ? (
              <div className="panel">
                {!prediction ? (
                  <div style={{ padding: "1rem", background: "#f0f9ff", borderRadius: "8px", borderLeft: "4px solid #2563EB", color: "#1E40AF" }}>
                    No patient data found. Go to the Patients tab and run a prediction first.
                  </div>
                ) : (
                  <>
                    <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1.5rem", borderBottom: "2px solid #e5e7eb", paddingBottom: "0.5rem" }}>
                      <button
                        className={`tab-pill ${explainabilityTab === "global" ? "active" : ""}`}
                        onClick={() => setExplainabilityTab("global")}
                        style={{ marginBottom: "-2px" }}
                      >
                        Global Explanation
                      </button>
                      <button
                        className={`tab-pill ${explainabilityTab === "patient" ? "active" : ""}`}
                        onClick={() => setExplainabilityTab("patient")}
                        style={{ marginBottom: "-2px" }}
                      >
                        Patient-Specific
                      </button>
                    </div>

                    {explainabilityTab === "global" ? (
                      <div>
                        <h4 style={{ marginTop: 0, marginBottom: "1rem" }}>Global Feature Importance</h4>
                        {featureImportance.length > 0 ? (
                          <div style={{ marginBottom: "1.5rem" }}>
                            <Plot
                              data={[
                                {
                                  type: "bar",
                                  x: featureImportance.slice(0, 15).map((f) => f.importance),
                                  y: featureImportance.slice(0, 15).map((f) => f.feature.replace(/_/g, " ").replace(/\b\w/g, (l: string) => l.toUpperCase())),
                                  orientation: "h",
                                  marker: {
                                    color: featureImportance.slice(0, 15).map((f) => f.importance),
                                    colorscale: "Viridis",
                                    showscale: true,
                                    colorbar: {
                                      title: "Importance"
                                    }
                                  }
                                }
                              ]}
                              layout={{
                                title: "Top 15 Most Important Features",
                                height: 600,
                                xaxis: { title: "Importance" },
                                yaxis: { title: "Feature", autorange: "reversed" },
                                paper_bgcolor: "rgba(255, 255, 255, 0)",
                                plot_bgcolor: "rgba(255, 255, 255, 0)",
                                font: {
                                  family: "Inter, -apple-system, sans-serif",
                                  size: 12
                                },
                                margin: { l: 200, r: 50, t: 50, b: 50 }
                              }}
                              config={{
                                displayModeBar: true,
                                responsive: true
                              }}
                              style={{ width: "100%", height: "100%" }}
                            />
                          </div>
                        ) : (
                          <div style={{ color: "#6B7280", padding: "2rem", textAlign: "center" }}>
                            Loading feature importance data...
                          </div>
                        )}
                      </div>
                    ) : (
                      <div>
                        <h4 style={{ marginTop: 0, marginBottom: "1rem" }}>Patient-Specific SHAP Analysis</h4>
                        {prediction.shap_top_contributors && prediction.shap_top_contributors.length > 0 ? (
                          <>
                            <div style={{
                              padding: "1.5rem",
                              background: "#f0f9ff",
                              borderRadius: "12px",
                              borderLeft: "4px solid #2563EB",
                              marginBottom: "2rem"
                            }}>
                              <h4 style={{ color: "#1E40AF", marginTop: 0, marginBottom: "0.5rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                                <Image src="/analytics-03-Stroke-Rounded.png" alt="Analytics" width={20} height={20} />
                                Clear Explanation
                              </h4>
                              <p style={{ color: "#1E3A8A", fontSize: "1.1rem", margin: 0 }}>
                                This patient's risk is <strong>{prediction.risk_category.toLowerCase()}</strong> ({(prediction.risk_score * 100).toFixed(1)}%) mainly due to: <strong>
                                  {prediction.shap_top_contributors.slice(0, 3).map((c) => {
                                    const name = c.feature.replace(/_/g, " ").replace(/\b\w/g, (l: string) => l.toUpperCase());
                                    if (c.feature.includes("anchor_age")) return `Age (${patientData.anchor_age})`;
                                    if (c.feature.includes("lab_creatinine")) return `Creatinine (${patientData.lab_creatinine?.toFixed(1)} mg/dL)`;
                                    if (c.feature.includes("lab_hemoglobin")) return `Hemoglobin (${patientData.lab_hemoglobin?.toFixed(1)} g/dL)`;
                                    if (c.feature.includes("mean_adr_rate") || c.feature.includes("max_adr_rate")) {
                                      return medications.length > 0 ? `Drug ${medications[0]?.name}` : "Medication Risk";
                                    }
                                    return name;
                                  }).join(", ")}
                                </strong>.
                              </p>
                            </div>

                            <h4 style={{ marginTop: 0, marginBottom: "1rem" }}>Interactive Feature Contributions</h4>
                            <div style={{ marginBottom: "2rem" }}>
                              <Plot
                                data={[
                                  {
                                    type: "bar",
                                    x: prediction.shap_top_contributors.map((c) => c.shap_value),
                                    y: prediction.shap_top_contributors.map((c) => {
                                      const name = c.feature.replace(/_/g, " ").replace(/\b\w/g, (l: string) => l.toUpperCase());
                                      if (c.feature.includes("anchor_age")) return `Age (${patientData.anchor_age})`;
                                      if (c.feature.includes("lab_creatinine")) return `Creatinine (${patientData.lab_creatinine?.toFixed(1)})`;
                                      if (c.feature.includes("lab_hemoglobin")) return `Hemoglobin (${patientData.lab_hemoglobin?.toFixed(1)})`;
                                      return name;
                                    }),
                                    orientation: "h",
                                    marker: {
                                      color: prediction.shap_top_contributors.map((c) => c.shap_value),
                                      colorscale: "RdBu",
                                      showscale: true,
                                      colorbar: {
                                        title: "Contribution to Risk"
                                      }
                                    }
                                  }
                                ]}
                                layout={{
                                  title: "Top 10 Feature Contributions to ADR Risk",
                                  height: 500,
                                  xaxis: { title: "Contribution to Risk" },
                                  yaxis: { title: "Feature Name", autorange: "reversed" },
                                  paper_bgcolor: "rgba(255, 255, 255, 0)",
                                  plot_bgcolor: "rgba(255, 255, 255, 0)",
                                  font: {
                                    family: "Inter, -apple-system, sans-serif",
                                    size: 12
                                  },
                                  margin: { l: 200, r: 50, t: 50, b: 50 },
                                  showlegend: false
                                }}
                                config={{
                                  displayModeBar: true,
                                  responsive: true
                                }}
                                style={{ width: "100%", height: "100%" }}
                              />
                            </div>

                            <h4 style={{ marginTop: "2rem", marginBottom: "1rem" }}>Detailed Factor Contributions</h4>
                            <div style={{ overflowX: "auto" }}>
                              <table style={{ width: "100%", borderCollapse: "collapse", background: "#ffffff", borderRadius: "8px", overflow: "hidden", border: "1px solid #e5e7eb" }}>
                                <thead>
                                  <tr style={{ background: "#f9fafb", borderBottom: "2px solid #e5e7eb" }}>
                                    <th style={{ padding: "0.75rem", textAlign: "left", fontWeight: 600, color: "#1f2937" }}>Feature</th>
                                    <th style={{ padding: "0.75rem", textAlign: "right", fontWeight: 600, color: "#1f2937" }}>SHAP Value</th>
                                    <th style={{ padding: "0.75rem", textAlign: "center", fontWeight: 600, color: "#1f2937" }}>Impact</th>
                                    <th style={{ padding: "0.75rem", textAlign: "right", fontWeight: 600, color: "#1f2937" }}>Magnitude</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {prediction.shap_top_contributors.map((contrib, idx) => {
                                    const isPositive = contrib.shap_value > 0;
                                    const featureName = contrib.feature
                                      .replace(/_/g, " ")
                                      .replace(/\b\w/g, (l: string) => l.toUpperCase());

                                    return (
                                      <tr key={idx} style={{ borderBottom: "1px solid #f3f4f6" }}>
                                        <td style={{ padding: "0.75rem", color: "#1f2937" }}>{featureName}</td>
                                        <td style={{ padding: "0.75rem", textAlign: "right", fontWeight: 600, color: isPositive ? "#dc2626" : "#16a34a" }}>
                                          {isPositive ? "+" : ""}{contrib.shap_value.toFixed(4)}
                                        </td>
                                        <td style={{ padding: "0.75rem", textAlign: "center" }}>
                                          <span style={{
                                            padding: "0.25rem 0.75rem",
                                            borderRadius: "4px",
                                            fontSize: "0.85rem",
                                            background: isPositive ? "#fef2f2" : "#f0fdf4",
                                            color: isPositive ? "#dc2626" : "#16a34a",
                                            fontWeight: 600
                                          }}>
                                            {isPositive ? "Increases" : "Decreases"}
                                          </span>
                                        </td>
                                        <td style={{ padding: "0.75rem", textAlign: "right", color: "#6B7280" }}>
                                          {Math.abs(contrib.shap_value).toFixed(4)}
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          </>
                        ) : (
                          <div style={{ padding: "1rem", background: "#fffbeb", borderRadius: "8px", borderLeft: "4px solid #f59e0b", marginBottom: "1rem" }}>
                            <div style={{ color: "#92400e", marginBottom: "0.5rem", fontWeight: 600 }}>Could not compute SHAP values</div>
                            <div style={{ color: "#78350f", fontSize: "0.9rem", marginBottom: "0.5rem" }}>
                              Showing model feature importance instead...
                            </div>
                            {featureImportance.length > 0 ? (
                              <div style={{ overflowX: "auto", marginTop: "1rem" }}>
                                <table style={{ width: "100%", borderCollapse: "collapse", background: "#ffffff", borderRadius: "8px", overflow: "hidden", border: "1px solid #e5e7eb" }}>
                                  <thead>
                                    <tr style={{ background: "#f9fafb", borderBottom: "2px solid #e5e7eb" }}>
                                      <th style={{ padding: "0.75rem", textAlign: "left", fontWeight: 600, color: "#1f2937" }}>Feature</th>
                                      <th style={{ padding: "0.75rem", textAlign: "right", fontWeight: 600, color: "#1f2937" }}>Importance</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {featureImportance.slice(0, 10).map((f, idx) => (
                                      <tr key={idx} style={{ borderBottom: "1px solid #f3f4f6" }}>
                                        <td style={{ padding: "0.75rem", color: "#1f2937" }}>{f.feature.replace(/_/g, " ").replace(/\b\w/g, (l: string) => l.toUpperCase())}</td>
                                        <td style={{ padding: "0.75rem", textAlign: "right", color: "#1f2937" }}>{f.importance.toFixed(4)}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            ) : null}
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            ) : null}

            {tab === "Bias Audit" ? (
              <div className="panel">
                <h3 style={{ marginTop: 0 }}>Model Performance & Analytics (Bias Audit)</h3>

                {/* Performance Metrics Section */}
                <div style={{ marginTop: "1.5rem", marginBottom: "1.5rem" }}>
                  <h4 style={{ marginTop: 0, marginBottom: "0.75rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <Image src="/analytics-03-Stroke-Rounded.png" alt="Analytics" width={20} height={20} />
                    Overall Performance Metrics
                  </h4>
                  {metrics && metrics.overall ? (
                    <>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "1rem", marginBottom: "1.5rem" }}>
                        <div style={{ padding: "1rem", background: "#f9fafb", borderRadius: "8px", border: "1px solid #e5e7eb" }}>
                          <div style={{ fontSize: "0.85rem", color: "#6B7280", marginBottom: "0.25rem" }}>AUC-ROC</div>
                          <div style={{ fontSize: "1.5rem", fontWeight: 700 }}>{Number(metrics.overall.auc_roc || 0).toFixed(3)}</div>
                        </div>
                        <div style={{ padding: "1rem", background: "#f9fafb", borderRadius: "8px", border: "1px solid #e5e7eb" }}>
                          <div style={{ fontSize: "0.85rem", color: "#6B7280", marginBottom: "0.25rem" }}>Precision</div>
                          <div style={{ fontSize: "1.5rem", fontWeight: 700 }}>{Number(metrics.overall.precision || 0).toFixed(3)}</div>
                        </div>
                        <div style={{ padding: "1rem", background: "#f9fafb", borderRadius: "8px", border: "1px solid #e5e7eb" }}>
                          <div style={{ fontSize: "0.85rem", color: "#6B7280", marginBottom: "0.25rem" }}>Recall</div>
                          <div style={{ fontSize: "1.5rem", fontWeight: 700 }}>{Number(metrics.overall.recall || 0).toFixed(3)}</div>
                        </div>
                        <div style={{ padding: "1rem", background: "#f9fafb", borderRadius: "8px", border: "1px solid #e5e7eb" }}>
                          <div style={{ fontSize: "0.85rem", color: "#6B7280", marginBottom: "0.25rem" }}>F1-Score</div>
                          <div style={{ fontSize: "1.5rem", fontWeight: 700 }}>{Number(metrics.overall.f1 || 0).toFixed(3)}</div>
                        </div>
                      </div>

                      <div style={{ marginTop: "1.5rem", marginBottom: "1.5rem" }}>
                        <strong style={{ fontSize: "0.95rem", color: "#374151" }}>Additional Metrics</strong>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "1rem", marginTop: "0.75rem" }}>
                          <div style={{ padding: "1rem", background: "#f9fafb", borderRadius: "8px", border: "1px solid #e5e7eb" }}>
                            <div style={{ fontSize: "0.85rem", color: "#6B7280", marginBottom: "0.25rem" }}>Accuracy</div>
                            <div style={{ fontSize: "1.5rem", fontWeight: 700 }}>{Number(metrics.overall.accuracy || 0).toFixed(3)}</div>
                          </div>
                          <div style={{ padding: "1rem", background: "#f9fafb", borderRadius: "8px", border: "1px solid #e5e7eb" }}>
                            <div style={{ fontSize: "0.85rem", color: "#6B7280", marginBottom: "0.25rem" }}>Balanced Accuracy</div>
                            <div style={{ fontSize: "1.5rem", fontWeight: 700 }}>{Number(metrics.overall.balanced_accuracy || 0).toFixed(3)}</div>
                          </div>
                          <div style={{ padding: "1rem", background: "#f9fafb", borderRadius: "8px", border: "1px solid #e5e7eb" }}>
                            <div style={{ fontSize: "0.85rem", color: "#6B7280", marginBottom: "0.25rem" }}>AUC-PR</div>
                            <div style={{ fontSize: "1.5rem", fontWeight: 700 }}>{Number(metrics.overall.auc_pr || 0).toFixed(3)}</div>
                          </div>
                          <div style={{ padding: "1rem", background: "#f9fafb", borderRadius: "8px", border: "1px solid #e5e7eb" }}>
                            <div style={{ fontSize: "0.85rem", color: "#6B7280", marginBottom: "0.25rem" }}>Matthews Correlation</div>
                            <div style={{ fontSize: "1.5rem", fontWeight: 700 }}>{Number(metrics.overall.matthews_corrcoef || 0).toFixed(3)}</div>
                          </div>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div style={{ padding: "1rem", background: "#fffbeb", borderRadius: "8px", borderLeft: "4px solid #f59e0b", color: "#92400e" }}>
                      Metrics not yet available. Please run evaluation.
                    </div>
                  )}
                </div>

                {/* Confusion Matrix Section */}
                <div style={{ marginTop: "2rem", marginBottom: "1.5rem" }}>
                  <h4 style={{ marginTop: 0, marginBottom: "0.75rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <Image src="/analytics-03-Stroke-Rounded.png" alt="Analytics" width={20} height={20} />
                    Confusion Matrix
                  </h4>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                    <div>
                      <div style={{ position: "relative", width: "100%", minHeight: "200px", borderRadius: 12, border: "1px solid #E5E7EB", marginTop: 8, background: "#F9FAFB", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <img
                          src="https://web-production-9491d.up.railway.app/reports/confusion_matrix.png"
                          alt="confusion_matrix"
                          style={{ width: "100%", borderRadius: 12, display: "block" }}
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = "none";
                            const parent = (e.target as HTMLImageElement).parentElement;
                            if (parent && !parent.querySelector('.error-message')) {
                              const errorDiv = document.createElement("div");
                              errorDiv.className = "error-message";
                              errorDiv.innerHTML = `
                                <div style="color: #6B7280; padding: 2rem; text-align: center; font-size: 0.9rem;">
                                  Confusion matrix not available. Run model training/evaluation first.
                                  <br />
                                  <small style="color: #9CA3AF; font-size: 0.85rem; display: inline-flex; align-items: center; gap: 0.25rem;">
                                    <img src="/brain-ai-3-line.png" alt="Tip" width="14" height="14" style="display: inline-block; vertical-align: middle;" />
                                    Tip: The confusion matrix is generated during model training, not evaluation.
                                  </small>
                                </div>
                              `;
                              parent.appendChild(errorDiv);
                            }
                          }}
                        />
                      </div>
                    </div>
                    <div>
                      <strong style={{ display: "block", marginBottom: "0.5rem" }}>ROC Curve</strong>
                      <div style={{ position: "relative", width: "100%", minHeight: "200px", borderRadius: 12, border: "1px solid #E5E7EB", marginTop: 8, background: "#F9FAFB", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <img
                          src="https://web-production-9491d.up.railway.app/reports/roc_curve.png"
                          alt="roc_curve"
                          style={{ width: "100%", borderRadius: 12, display: "block" }}
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = "none";
                            const parent = (e.target as HTMLImageElement).parentElement;
                            if (parent && !parent.querySelector('.error-message')) {
                              const errorDiv = document.createElement("div");
                              errorDiv.className = "error-message";
                              errorDiv.innerHTML = `
                                <div style="color: #6B7280; padding: 2rem; text-align: center; font-size: 0.9rem;">
                                  ROC curve not available. Run model training/evaluation first.
                                  <br />
                                  <small style="color: #9CA3AF; font-size: 0.85rem; display: inline-flex; align-items: center; gap: 0.25rem;">
                                    <img src="/brain-ai-3-line.png" alt="Tip" width="14" height="14" style="display: inline-block; vertical-align: middle;" />
                                    Tip: The ROC curve is generated during model training, not evaluation.
                                  </small>
                                </div>
                              `;
                              parent.appendChild(errorDiv);
                            }
                          }}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Fairness Metrics by Demographics */}
                <div style={{ marginTop: "2rem", marginBottom: "1.5rem" }}>
                  <h4 style={{ marginTop: 0, marginBottom: "0.75rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <Image src="/target-02-Stroke-Rounded.png" alt="Balance" width={20} height={20} />
                    Fairness Metrics by Demographics
                  </h4>
                  <div style={{ padding: "1rem", background: "#f0f9ff", borderRadius: "8px", borderLeft: "4px solid #2563EB", marginBottom: "1.5rem" }}>
                    <div style={{ color: "#1E40AF", fontSize: "0.9rem", margin: 0 }}>
                      Bias audit analysis across age, sex, and key subgroups for equitable care.
                    </div>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                    <div>
                      <strong style={{ display: "block", marginBottom: "0.5rem" }}>Fairness by Sex</strong>
                      <div style={{ position: "relative", width: "100%", minHeight: "200px", borderRadius: 12, border: "1px solid #E5E7EB", marginTop: 8, background: "#F9FAFB", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <img
                          src="https://web-production-9491d.up.railway.app/reports/fairness_auc.png"
                          alt="fairness_auc"
                          style={{ width: "100%", borderRadius: 12, display: "block" }}
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = "none";
                            const parent = (e.target as HTMLImageElement).parentElement;
                            if (parent && !parent.querySelector('.error-message')) {
                              const errorDiv = document.createElement("div");
                              errorDiv.className = "error-message";
                              errorDiv.innerHTML = `
                                <div style="color: #92400e; padding: 2rem; text-align: center; font-size: 0.9rem;">
                                  Fairness analysis by sex not available. Run evaluation first.
                                </div>
                              `;
                              parent.appendChild(errorDiv);
                            }
                          }}
                        />
                      </div>
                      <div style={{ marginTop: "1rem", position: "relative", width: "100%", minHeight: "200px", borderRadius: 12, border: "1px solid #E5E7EB", background: "#F9FAFB", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <img
                          src="https://web-production-9491d.up.railway.app/reports/fairness_f1.png"
                          alt="fairness_f1"
                          style={{ width: "100%", borderRadius: 12, display: "block" }}
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = "none";
                            const parent = (e.target as HTMLImageElement).parentElement;
                            if (parent && !parent.querySelector('.error-message')) {
                              const errorDiv = document.createElement("div");
                              errorDiv.className = "error-message";
                              errorDiv.innerHTML = `
                                <div style="color: #92400e; padding: 2rem; text-align: center; font-size: 0.9rem;">
                                  Fairness F1 analysis not available.
                                </div>
                              `;
                              parent.appendChild(errorDiv);
                            }
                          }}
                        />
                      </div>
                    </div>
                    <div>
                      <strong style={{ display: "block", marginBottom: "0.5rem" }}>Calibration & Calibration by Group</strong>
                      <div style={{ position: "relative", width: "100%", minHeight: "200px", borderRadius: 12, border: "1px solid #E5E7EB", marginTop: 8, background: "#F9FAFB", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <img
                          src="https://web-production-9491d.up.railway.app/reports/calibration_curve.png"
                          alt="calibration_curve"
                          style={{ width: "100%", borderRadius: 12, display: "block" }}
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = "none";
                            const parent = (e.target as HTMLImageElement).parentElement;
                            if (parent && !parent.querySelector('.error-message')) {
                              const errorDiv = document.createElement("div");
                              errorDiv.className = "error-message";
                              errorDiv.innerHTML = `
                                <div style="color: #6B7280; padding: 2rem; text-align: center; font-size: 0.9rem;">
                                  Calibration curve not available.
                                </div>
                              `;
                              parent.appendChild(errorDiv);
                            }
                          }}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Detailed Fairness Metrics */}
                <div style={{ marginTop: "2rem", marginBottom: "1.5rem" }}>
                  <h4 style={{ marginTop: 0, marginBottom: "0.75rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <Image src="/document-validation-Stroke-Rounded.png" alt="Document" width={20} height={20} />
                    Detailed Fairness Metrics
                  </h4>
                  {metrics && metrics.groups ? (
                    <div style={{ overflowX: "auto", marginTop: "1rem" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", background: "#ffffff", borderRadius: "8px", overflow: "hidden", border: "1px solid #e5e7eb" }}>
                        <thead>
                          <tr style={{ background: "#f9fafb", borderBottom: "2px solid #e5e7eb" }}>
                            <th style={{ padding: "0.75rem", textAlign: "left", fontWeight: 600, color: "#1f2937" }}>Group</th>
                            <th style={{ padding: "0.75rem", textAlign: "right", fontWeight: 600, color: "#1f2937" }}>AUC</th>
                            <th style={{ padding: "0.75rem", textAlign: "right", fontWeight: 600, color: "#1f2937" }}>Precision</th>
                            <th style={{ padding: "0.75rem", textAlign: "right", fontWeight: 600, color: "#1f2937" }}>Recall</th>
                            <th style={{ padding: "0.75rem", textAlign: "right", fontWeight: 600, color: "#1f2937" }}>F1-Score</th>
                          </tr>
                        </thead>
                        <tbody>
                          {metrics.groups.map((group: GroupMetrics, idx: number) => (
                            <tr key={idx} style={{ borderBottom: "1px solid #f3f4f6", background: idx % 2 === 1 ? "#fafafa" : "#ffffff" }}>
                              <td style={{ padding: "0.75rem", color: "#1f2937" }}>{group.Group}</td>
                              <td style={{ padding: "0.75rem", textAlign: "right", color: "#1f2937" }}>{Number(group.auc_roc || 0).toFixed(3)}</td>
                              <td style={{ padding: "0.75rem", textAlign: "right", color: "#1f2937" }}>{Number(group.precision || 0).toFixed(3)}</td>
                              <td style={{ padding: "0.75rem", textAlign: "right", color: "#1f2937" }}>{Number(group.recall || 0).toFixed(3)}</td>
                              <td style={{ padding: "0.75rem", textAlign: "right", color: "#1f2937" }}>{Number(group.f1 || 0).toFixed(3)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div style={{ padding: "1rem", background: "#f0f9ff", borderRadius: "8px", borderLeft: "4px solid #2563EB", color: "#1E40AF", fontSize: "0.9rem" }}>
                      <strong>Fairness Metrics Structure:</strong>
                      <ul style={{ marginTop: "0.5rem", marginBottom: 0, paddingLeft: "1.5rem" }}>
                        <li><strong>By Sex:</strong> AUC, Precision, Recall, F1 for Male vs Female</li>
                        <li><strong>By Age Group:</strong> AUC, Precision, Recall, F1 for different age groups</li>
                        <li><strong>By Comorbidity:</strong> AUC, Precision, Recall, F1 for patients with/without comorbidities</li>
                      </ul>
                      <div style={{ marginTop: "0.5rem", fontSize: "0.85rem" }}>
                        Run the evaluation script to generate detailed fairness metrics.
                      </div>
                    </div>
                  )}
                </div>

              </div>
            ) : null}

            {tab === "Workflow Efficiency" ? (
              <div className="panel">
                <h3 style={{ marginTop: 0 }}>Workflow Efficiency</h3>

                <div style={{ marginTop: "1.5rem", marginBottom: "1.5rem" }}>
                  <h4 style={{ marginTop: 0, marginBottom: "0.75rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <Image src="/database-lightning-Stroke-Rounded.png" alt="Performance" width={20} height={20} />
                    System Performance
                  </h4>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "1rem" }}>
                    <div style={{ padding: "1rem", background: "#f9fafb", borderRadius: "8px", border: "1px solid #e5e7eb" }}>
                      <div style={{ fontSize: "0.85rem", color: "#6B7280", marginBottom: "0.25rem" }}>Avg Prediction Time</div>
                      <div style={{ fontSize: "1.5rem", fontWeight: 700 }}>&lt; 200 ms</div>
                    </div>
                    <div style={{ padding: "1rem", background: "#f9fafb", borderRadius: "8px", border: "1px solid #e5e7eb" }}>
                      <div style={{ fontSize: "0.85rem", color: "#6B7280", marginBottom: "0.25rem" }}>Model Version</div>
                      <div style={{ fontSize: "1.5rem", fontWeight: 700 }}>1.0</div>
                    </div>
                    <div style={{ padding: "1rem", background: "#f9fafb", borderRadius: "8px", border: "1px solid #e5e7eb" }}>
                      <div style={{ fontSize: "0.85rem", color: "#6B7280", marginBottom: "0.25rem" }}>Last Updated</div>
                      <div style={{ fontSize: "1.5rem", fontWeight: 700 }}>{new Date().toISOString().split('T')[0]}</div>
                    </div>
                  </div>
                </div>


                {/* Reduction in Alert Fatigue section removed as per user request */}


                <div style={{ marginTop: "2rem", marginBottom: "1.5rem" }}>
                  <h4 style={{ marginTop: 0, marginBottom: "0.75rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <Image src="/document-validation-Stroke-Rounded.png" alt="Feedback" width={20} height={20} />
                    Pharmacist Feedback Survey
                  </h4>
                  <div style={{ padding: "1rem", background: "#f0f9ff", borderRadius: "8px", borderLeft: "4px solid #2563EB", marginBottom: "1.5rem" }}>
                    <div style={{ color: "#1E40AF", fontSize: "0.9rem", margin: 0 }}>
                      Your feedback helps us improve the AI-CPA system and enhance clinical decision support
                    </div>
                  </div>

                  {feedbackSubmitted ? (
                    <div style={{ padding: "1.5rem", background: "#d1fae5", borderRadius: "12px", border: "1px solid #10b981", textAlign: "center" }}>
                      <div style={{ color: "#065f46", fontSize: "1.1rem", fontWeight: 600, marginBottom: "0.5rem" }}>
                        ✓ Thank you for your feedback!
                      </div>
                      <div style={{ color: "#047857", fontSize: "0.9rem" }}>
                        Your response has been recorded and will help us improve the system.
                      </div>
                    </div>
                  ) : (
                    <div style={{ padding: "1.5rem", background: "#ffffff", borderRadius: "12px", border: "1px solid #e5e7eb" }}>
                      <div style={{ marginBottom: "1.5rem" }}>
                        <label style={{ display: "block", marginBottom: "0.75rem", fontWeight: 600, fontSize: "0.95rem" }}>
                          How useful was this prediction?
                        </label>
                        <select
                          value={feedbackUsefulness}
                          onChange={(e) => setFeedbackUsefulness(e.target.value)}
                          style={{
                            width: "100%",
                            padding: "0.75rem",
                            border: "1px solid #e5e7eb",
                            borderRadius: "8px",
                            fontSize: "0.95rem",
                            background: "#ffffff"
                          }}
                        >
                          <option value="Not Useful">Not Useful</option>
                          <option value="Slightly Useful">Slightly Useful</option>
                          <option value="Moderately Useful">Moderately Useful</option>
                          <option value="Very Useful">Very Useful</option>
                          <option value="Extremely Useful">Extremely Useful</option>
                        </select>
                      </div>

                      <div style={{ marginBottom: "1.5rem" }}>
                        <label style={{ display: "block", marginBottom: "0.75rem", fontWeight: 600, fontSize: "0.95rem" }}>
                          How accurate was the risk assessment?
                        </label>
                        <select
                          value={feedbackAccuracy}
                          onChange={(e) => setFeedbackAccuracy(e.target.value)}
                          style={{
                            width: "100%",
                            padding: "0.75rem",
                            border: "1px solid #e5e7eb",
                            borderRadius: "8px",
                            fontSize: "0.95rem",
                            background: "#ffffff"
                          }}
                        >
                          <option value="Very Inaccurate">Very Inaccurate</option>
                          <option value="Inaccurate">Inaccurate</option>
                          <option value="Neutral">Neutral</option>
                          <option value="Accurate">Accurate</option>
                          <option value="Very Accurate">Very Accurate</option>
                        </select>
                      </div>

                      <div style={{ marginBottom: "1.5rem" }}>
                        <label style={{ display: "block", marginBottom: "0.75rem", fontWeight: 600, fontSize: "0.95rem" }}>
                          How would you rate the system's response time?
                        </label>
                        <select
                          value={feedbackResponseTime}
                          onChange={(e) => setFeedbackResponseTime(e.target.value)}
                          style={{
                            width: "100%",
                            padding: "0.75rem",
                            border: "1px solid #e5e7eb",
                            borderRadius: "8px",
                            fontSize: "0.95rem",
                            background: "#ffffff"
                          }}
                        >
                          <option value="Very Slow">Very Slow</option>
                          <option value="Slow">Slow</option>
                          <option value="Acceptable">Acceptable</option>
                          <option value="Fast">Fast</option>
                          <option value="Very Fast">Very Fast</option>
                        </select>
                      </div>

                      <div style={{ marginBottom: "1.5rem" }}>
                        <label style={{ display: "block", marginBottom: "0.75rem", fontWeight: 600, fontSize: "0.95rem" }}>
                          How much did this prediction reduce your workload?
                        </label>
                        <select
                          value={feedbackWorkloadReduction}
                          onChange={(e) => setFeedbackWorkloadReduction(e.target.value)}
                          style={{
                            width: "100%",
                            padding: "0.75rem",
                            border: "1px solid #e5e7eb",
                            borderRadius: "8px",
                            fontSize: "0.95rem",
                            background: "#ffffff"
                          }}
                        >
                          <option value="No Reduction">No Reduction</option>
                          <option value="Slight Reduction">Slight Reduction</option>
                          <option value="Moderate Reduction">Moderate Reduction</option>
                          <option value="Significant Reduction">Significant Reduction</option>
                          <option value="Major Reduction">Major Reduction</option>
                        </select>
                      </div>

                      <div style={{ marginBottom: "1.5rem" }}>
                        <label style={{ display: "block", marginBottom: "0.75rem", fontWeight: 600, fontSize: "0.95rem" }}>
                          Additional Comments
                        </label>
                        <textarea
                          value={feedbackComments}
                          onChange={(e) => setFeedbackComments(e.target.value)}
                          placeholder="Share your thoughts..."
                          style={{
                            width: "100%",
                            padding: "0.75rem",
                            border: "1px solid #e5e7eb",
                            borderRadius: "8px",
                            minHeight: "100px",
                            fontFamily: "inherit",
                            fontSize: "0.95rem",
                            resize: "vertical"
                          }}
                        />
                      </div>

                      <button
                        onClick={submitFeedback}
                        style={{
                          width: "100%",
                          padding: "0.875rem 1.5rem",
                          background: "#2563EB",
                          color: "#ffffff",
                          border: "none",
                          borderRadius: "8px",
                          fontWeight: 600,
                          cursor: "pointer",
                          fontSize: "1rem"
                        }}
                      >
                        Submit Feedback
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ) : null}
          </>
        ) : null}

        {view === "history" ? (
          <div className="panel">
            <h3 style={{ marginTop: 0 }}>My Saved Reports</h3>
            {!history.length ? (
              <div>No saved reports found.</div>
            ) : (
              <div style={{ display: "grid", gap: "0.75rem" }}>
                {history.map((r) => (
                  <div key={r.id} className="risk-box">
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "0.75rem" }}>
                      <div>
                        <b>
                          {new Date(r.created_at).toLocaleString()} — {r.risk_category} Risk ({(r.risk_score * 100).toFixed(1)}%)
                        </b>
                        <div style={{ color: "#6B7280" }}>{r.patient_name || "Patient"}</div>
                      </div>
                      <button
                        className="sidebar-btn"
                        onClick={() => {
                          setPatientData(r.patient_data);
                          setPrediction(r.prediction_result);
                          setView("dashboard");
                          setTab("ADR Predictions");
                        }}
                      >
                        Load to Dashboard
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : null}

        {view === "admin" ? (
          <div className="panel">
            <h3 style={{ marginTop: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Image src="/security-lock-Stroke-Rounded.png" alt="Security" width={24} height={24} />
              Admin Dashboard
            </h3>
            {!isAdmin ? (
              <div>Access Denied.</div>
            ) : (
              <>
                <div style={{ color: "#6B7280", marginBottom: "0.75rem" }}>
                  Listing records from the shared Postgres DB (existing DATABASE_URL).
                </div>
                {!adminRecords.length ? (
                  <div>No records yet.</div>
                ) : (
                  <div style={{ display: "grid", gap: "0.75rem" }}>
                    {adminRecords.slice(0, 25).map((r: any) => (
                      <div key={r.id} className="risk-box">
                        <b>
                          #{r.id} — {r.risk_category} ({(r.risk_score * 100).toFixed(1)}%) — user {r.user_id}
                        </b>
                        <div style={{ color: "#6B7280" }}>{new Date(r.created_at).toLocaleString()}</div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        ) : null}
      </main>
    </div>
  );
}


