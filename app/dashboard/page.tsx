"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { clearAuth, getToken, getUser, User } from "@/lib/auth";
import { RiskGauge } from "@/components/RiskGauge";
import Image from "next/image";
import dynamic from "next/dynamic";

const Plot = dynamic(() => import("react-plotly.js"), { ssr: false });

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

  // Sidebar "Navigate" matches Streamlit: Dashboard / My History / Admin Panel
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
    // labs (defaults from Streamlit)
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
  const [prediction, setPrediction] = useState<PredictionResponse | null>(null);
  const [predicting, setPredicting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadMethod, setUploadMethod] = useState<"manual" | "json" | "csv">("manual");
  const [uploadFile, setUploadFile] = useState<File | null>(null);

  // History/admin
  const [history, setHistory] = useState<RecordOut[]>([]);
  const [adminRecords, setAdminRecords] = useState<any[]>([]);
  const [metrics, setMetrics] = useState<any | null>(null);
  const [featureImportance, setFeatureImportance] = useState<{ feature: string; importance: number }[]>([]);
  const [explainabilityTab, setExplainabilityTab] = useState<"global" | "patient">("patient");

  useEffect(() => {
    if (!getToken()) router.replace("/auth");
    setUser(getUser());
    
    // Load drug options
    apiFetch<{ drugs: string[] }>("/api/predictions/drugs")
      .then((res) => {
        console.log("Drugs API response:", res);
        if (res.drugs && res.drugs.length > 0) {
          const options = ["Select a drug...", ...res.drugs, "Other"];
          console.log("Setting drug options:", options.length, "items");
          setDrugOptions(options);
        } else {
          console.warn("No drugs returned from API, response:", res);
          setDrugOptions(["Select a drug...", "Other"]);
        }
      })
      .catch((err) => {
        console.error("Failed to load drugs:", err);
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

      // Extract drug names from medications array
      const selected_drugs = medications.map((m) => m.name).filter(Boolean);

      // Prepare patient data with both formats for compatibility
      const dataToSend = {
        ...patientData,
        selected_drugs, // Array of drug names for backend
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
    const m = await apiFetch<any>("/api/metrics/performance");
    setMetrics(m);
  }

  function logout() {
    clearAuth();
    router.replace("/auth");
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
                  Comprehensive assessment for precise ADR prediction (ported to Next.js).
                </div>

                <h4 style={{ marginTop: 0 }}>Upload Patient Data</h4>
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
                        ⚠️ High Risk / Narrow Therapeutic Index
                      </label>
                      
                      <button
                        className="btn-primary"
                        onClick={() => {
                          const drugName = selectedDrug === "Other" ? manualDrugName.trim() : selectedDrug;
                          if (!drugName || drugName === "Select a drug...") {
                            setError("Please select or enter a drug name");
                            return;
                          }
                          
                          const newMed = {
                            name: drugName,
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
                          setSelectedDrug("");
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
                                      <span style={{ color: "#dc2626" }}>⚠️</span>
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
                      <div style={{ display: "grid", gap: "0.35rem" }}>
                        {prediction.shap_top_contributors.slice(0, 10).map((c, idx) => (
                          <div key={idx}>
                            <b>{c.feature}</b>: {c.shap_value.toFixed(4)}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div>SHAP unavailable.</div>
                    )}

                    <hr style={{ margin: "1rem 0" }} />
                    <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <Image src="/hospital-02-Stroke-Rounded.png" alt="Hospital" width={24} height={24} />
                      Clinical Recommendations
                    </h3>
                    <div style={{ display: "grid", gap: "0.35rem" }}>
                      {(prediction.recommendations || []).map((r, idx) => (
                        <div key={idx}>• {r}</div>
                      ))}
                    </div>

                    {prediction.ai_recommendations_md ? (
                      <>
                        <hr style={{ margin: "1rem 0" }} />
                        <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <Image src="/robot-02-Stroke-Rounded.png" alt="AI" width={24} height={24} />
                          AI Pharmacist Insights (Powered by Gemini)
                        </h3>
                        <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit" }}>{prediction.ai_recommendations_md}</pre>
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
                <h3 style={{ marginTop: 0 }}>Model Explainability & Insights</h3>
                
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
                      <>
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
                        <div style={{ marginTop: "1.5rem", padding: "1rem", background: "#f9fafb", borderRadius: "8px" }}>
                          <p style={{ margin: 0, color: "#6B7280", fontSize: "0.9rem" }}>
                            This chart shows the global feature importance across all predictions. These are the features that the model considers most important when making ADR risk predictions.
                          </p>
                        </div>
                      </>
                    ) : (
                      <div style={{ color: "#6B7280", padding: "2rem", textAlign: "center" }}>
                        Loading feature importance data...
                      </div>
                    )}
                  </div>
                ) : (
                  <div>
                    {!prediction ? (
                      <div style={{ color: "#6B7280", padding: "2rem", textAlign: "center" }}>
                        No prediction found. Go to the Patients tab and run a prediction first.
                      </div>
                    ) : (
                      <>
                        {prediction.shap_top_contributors && prediction.shap_top_contributors.length > 0 ? (
                          <>
                            <div style={{ 
                              padding: "1.5rem", 
                              background: "#f0f9ff", 
                              borderRadius: "12px", 
                              borderLeft: "4px solid #2563EB", 
                              marginBottom: "2rem" 
                            }}>
                              <h4 style={{ color: "#1E40AF", marginTop: 0, marginBottom: "0.5rem" }}>Clear Explanation</h4>
                              <p style={{ color: "#1E3A8A", fontSize: "1.1rem", margin: 0 }}>
                                This patient's risk is <strong>{prediction.risk_category.toLowerCase()}</strong> ({(prediction.risk_score * 100).toFixed(1)}%) mainly due to: <strong>
                                  {prediction.shap_top_contributors.slice(0, 3).map((c) => {
                                    const name = c.feature.replace(/_/g, " ").replace(/\b\w/g, (l: string) => l.toUpperCase());
                                    if (c.feature.includes("anchor_age")) return `Age (${patientData.anchor_age})`;
                                    if (c.feature.includes("lab_creatinine")) return `Creatinine (${patientData.lab_creatinine?.toFixed(1)} mg/dL)`;
                                    if (c.feature.includes("lab_hemoglobin")) return `Hemoglobin (${patientData.lab_hemoglobin?.toFixed(1)} g/dL)`;
                                    if (c.feature.includes("mean_adr_rate") || c.feature.includes("max_adr_rate")) {
                                      return medications.length > 0 ? `Medication Risk (${medications[0]?.name})` : "Medication Risk";
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
                                  margin: { l: 200, r: 50, t: 50, b: 50 }
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
                              <table style={{ width: "100%", borderCollapse: "collapse", background: "#ffffff", borderRadius: "8px", overflow: "hidden" }}>
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
                          <div style={{ padding: "2rem" }}>
                            <div style={{ 
                              padding: "1.5rem", 
                              background: "#fffbeb", 
                              borderRadius: "12px", 
                              borderLeft: "4px solid #f59e0b", 
                              marginBottom: "1rem" 
                            }}>
                              <h4 style={{ color: "#92400e", marginTop: 0, marginBottom: "0.5rem" }}>SHAP Explanation Unavailable</h4>
                              <p style={{ color: "#78350f", margin: 0 }}>
                                SHAP values could not be computed for this prediction. This may be due to:
                              </p>
                              <ul style={{ color: "#78350f", marginTop: "0.5rem", marginBottom: 0, paddingLeft: "1.5rem" }}>
                                <li>SHAP explainer not loaded properly</li>
                                <li>Feature mismatch between model and data</li>
                                <li>Computation error during SHAP calculation</li>
                              </ul>
                            </div>
                            <div style={{ 
                              padding: "1rem", 
                              background: "#f9fafb", 
                              borderRadius: "8px",
                              marginTop: "1rem"
                            }}>
                              <p style={{ margin: 0, color: "#6B7280", fontSize: "0.9rem" }}>
                                <strong>Risk Score:</strong> {(prediction.risk_score * 100).toFixed(1)}% ({prediction.risk_category} Risk)
                                <br />
                                <strong>Based on:</strong> {medications.length} {medications.length === 1 ? 'medication' : 'medications'} and current lab values
                              </p>
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            ) : null}

            {tab === "Bias Audit" ? (
              <div className="panel">
                <h3 style={{ marginTop: 0 }}>Model Performance & Analytics (Bias Audit)</h3>
                <button className="sidebar-btn" onClick={loadMetrics} style={{ marginBottom: "1rem" }}>
                  Load Metrics
                </button>
                
                {metrics ? (
                  <>
                    <h4 style={{ marginTop: 0, marginBottom: "0.75rem" }}>Overall Performance Metrics</h4>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "1rem", marginBottom: "1.5rem" }}>
                      <div style={{ padding: "1rem", background: "#f9fafb", borderRadius: "8px", border: "1px solid #e5e7eb" }}>
                        <div style={{ fontSize: "0.85rem", color: "#6B7280", marginBottom: "0.25rem" }}>AUC-ROC</div>
                        <div style={{ fontSize: "1.5rem", fontWeight: 700 }}>{Number(metrics.auc_roc).toFixed(3)}</div>
                      </div>
                      <div style={{ padding: "1rem", background: "#f9fafb", borderRadius: "8px", border: "1px solid #e5e7eb" }}>
                        <div style={{ fontSize: "0.85rem", color: "#6B7280", marginBottom: "0.25rem" }}>Precision</div>
                        <div style={{ fontSize: "1.5rem", fontWeight: 700 }}>{Number(metrics.precision).toFixed(3)}</div>
                      </div>
                      <div style={{ padding: "1rem", background: "#f9fafb", borderRadius: "8px", border: "1px solid #e5e7eb" }}>
                        <div style={{ fontSize: "0.85rem", color: "#6B7280", marginBottom: "0.25rem" }}>Recall</div>
                        <div style={{ fontSize: "1.5rem", fontWeight: 700 }}>{Number(metrics.recall).toFixed(3)}</div>
                      </div>
                      <div style={{ padding: "1rem", background: "#f9fafb", borderRadius: "8px", border: "1px solid #e5e7eb" }}>
                        <div style={{ fontSize: "0.85rem", color: "#6B7280", marginBottom: "0.25rem" }}>F1-Score</div>
                        <div style={{ fontSize: "1.5rem", fontWeight: 700 }}>{Number(metrics.f1).toFixed(3)}</div>
                      </div>
                    </div>
                    
                    <h4 style={{ marginTop: "1.5rem", marginBottom: "0.75rem" }}>Additional Metrics</h4>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "1rem", marginBottom: "1.5rem" }}>
                      <div style={{ padding: "1rem", background: "#f9fafb", borderRadius: "8px", border: "1px solid #e5e7eb" }}>
                        <div style={{ fontSize: "0.85rem", color: "#6B7280", marginBottom: "0.25rem" }}>Accuracy</div>
                        <div style={{ fontSize: "1.5rem", fontWeight: 700 }}>{Number(metrics.accuracy || 0).toFixed(3)}</div>
                      </div>
                      <div style={{ padding: "1rem", background: "#f9fafb", borderRadius: "8px", border: "1px solid #e5e7eb" }}>
                        <div style={{ fontSize: "0.85rem", color: "#6B7280", marginBottom: "0.25rem" }}>Balanced Accuracy</div>
                        <div style={{ fontSize: "1.5rem", fontWeight: 700 }}>{Number(metrics.balanced_accuracy || 0).toFixed(3)}</div>
                      </div>
                      <div style={{ padding: "1rem", background: "#f9fafb", borderRadius: "8px", border: "1px solid #e5e7eb" }}>
                        <div style={{ fontSize: "0.85rem", color: "#6B7280", marginBottom: "0.25rem" }}>AUC-PR</div>
                        <div style={{ fontSize: "1.5rem", fontWeight: 700 }}>{Number(metrics.auc_pr || 0).toFixed(3)}</div>
                      </div>
                      <div style={{ padding: "1rem", background: "#f9fafb", borderRadius: "8px", border: "1px solid #e5e7eb" }}>
                        <div style={{ fontSize: "0.85rem", color: "#6B7280", marginBottom: "0.25rem" }}>Matthews Correlation</div>
                        <div style={{ fontSize: "1.5rem", fontWeight: 700 }}>{Number(metrics.matthews_corrcoef || 0).toFixed(3)}</div>
                      </div>
                    </div>
                  </>
                ) : (
                  <div style={{ color: "#6B7280", marginBottom: "1.5rem" }}>
                    Click "Load Metrics" to view performance metrics.
                  </div>
                )}
                
                <h4 style={{ marginTop: "1.5rem", marginBottom: "0.75rem" }}>Visualizations</h4>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1rem" }}>
                  <div>
                    <b>Confusion Matrix</b>
                    <img
                      src={`${process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000"}/reports/confusion_matrix.png`}
                      alt="confusion_matrix"
                      style={{ width: "100%", borderRadius: 12, border: "1px solid #E5E7EB", marginTop: 8 }}
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = "none";
                        (e.target as HTMLImageElement).nextElementSibling?.remove();
                        const errorDiv = document.createElement("div");
                        errorDiv.textContent = "Confusion matrix not available";
                        errorDiv.style.cssText = "color: #6B7280; padding: 2rem; text-align: center;";
                        (e.target as HTMLImageElement).parentElement?.appendChild(errorDiv);
                      }}
                    />
                  </div>
                  <div>
                    <b>ROC Curve</b>
                    <img
                      src={`${process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000"}/reports/roc_curve.png`}
                      alt="roc_curve"
                      style={{ width: "100%", borderRadius: 12, border: "1px solid #E5E7EB", marginTop: 8 }}
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = "none";
                      }}
                    />
                  </div>
                  <div>
                    <b>Fairness (AUC)</b>
                    <img
                      src={`${process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000"}/reports/fairness_auc.png`}
                      alt="fairness_auc"
                      style={{ width: "100%", borderRadius: 12, border: "1px solid #E5E7EB", marginTop: 8 }}
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = "none";
                      }}
                    />
                  </div>
                  <div>
                    <b>Calibration</b>
                    <img
                      src={`${process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000"}/reports/calibration_curve.png`}
                      alt="calibration_curve"
                      style={{ width: "100%", borderRadius: 12, border: "1px solid #E5E7EB", marginTop: 8 }}
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = "none";
                      }}
                    />
                  </div>
                </div>
                
                <div style={{ marginTop: "1.5rem", padding: "1rem", background: "#f0f9ff", borderRadius: "8px", borderLeft: "4px solid #2563EB" }}>
                  <div style={{ color: "#1E40AF", fontSize: "0.9rem" }}>
                    <strong>Fairness Metrics:</strong> Bias audit analysis across age, sex, and key subgroups for equitable care.
                  </div>
                </div>
              </div>
            ) : null}

            {tab === "Workflow Efficiency" ? (
              <div className="panel">
                <h3 style={{ marginTop: 0 }}>Workflow Efficiency</h3>
                
                <h4 style={{ marginTop: "1.5rem", marginBottom: "0.75rem" }}>System Performance</h4>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "1rem", marginBottom: "2rem" }}>
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
                    <div style={{ fontSize: "1.5rem", fontWeight: 700 }}>{new Date().toLocaleDateString()}</div>
                  </div>
                </div>
                
                <h4 style={{ marginTop: "1.5rem", marginBottom: "0.75rem" }}>Reduction in Alert Fatigue</h4>
                <div style={{ padding: "1rem", background: "#f0f9ff", borderRadius: "8px", borderLeft: "4px solid #2563EB", marginBottom: "1.5rem" }}>
                  <div style={{ color: "#1E40AF", fontSize: "0.9rem" }}>
                    Simulated data showing the impact of AI-CPA on reducing unnecessary alerts
                  </div>
                </div>
                
                <div style={{ marginBottom: "2rem" }}>
                  <div style={{ padding: "1.5rem", background: "#ffffff", borderRadius: "12px", border: "1px solid #e5e7eb" }}>
                    <div style={{ color: "#6B7280", textAlign: "center", padding: "3rem" }}>
                      Alert fatigue reduction chart will be displayed here.
                      <br />
                      <small style={{ fontSize: "0.85rem" }}>This visualization shows monthly alert volume comparison between baseline and AI-CPA system.</small>
                    </div>
                  </div>
                </div>
                
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "1rem", marginBottom: "2rem" }}>
                  <div style={{ padding: "1rem", background: "#f9fafb", borderRadius: "8px", border: "1px solid #e5e7eb" }}>
                    <div style={{ fontSize: "0.85rem", color: "#6B7280", marginBottom: "0.25rem" }}>Alert Reduction</div>
                    <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "#16a34a" }}>~71%</div>
                    <div style={{ fontSize: "0.75rem", color: "#6B7280", marginTop: "0.25rem" }}>vs baseline</div>
                  </div>
                  <div style={{ padding: "1rem", background: "#f9fafb", borderRadius: "8px", border: "1px solid #e5e7eb" }}>
                    <div style={{ fontSize: "0.85rem", color: "#6B7280", marginBottom: "0.25rem" }}>Avg Monthly Alerts</div>
                    <div style={{ fontSize: "1.5rem", fontWeight: 700 }}>~55</div>
                    <div style={{ fontSize: "0.75rem", color: "#6B7280", marginTop: "0.25rem" }}>with AI-CPA</div>
                  </div>
                  <div style={{ padding: "1rem", background: "#f9fafb", borderRadius: "8px", border: "1px solid #e5e7eb" }}>
                    <div style={{ fontSize: "0.85rem", color: "#6B7280", marginBottom: "0.25rem" }}>Total Alerts Saved</div>
                    <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "#16a34a" }}>~780</div>
                    <div style={{ fontSize: "0.75rem", color: "#6B7280", marginTop: "0.25rem" }}>this year</div>
                  </div>
                </div>
                
                <h4 style={{ marginTop: "1.5rem", marginBottom: "0.75rem" }}>Pharmacist Feedback Survey</h4>
                <div style={{ padding: "1rem", background: "#f0f9ff", borderRadius: "8px", borderLeft: "4px solid #2563EB", marginBottom: "1.5rem" }}>
                  <div style={{ color: "#1E40AF", fontSize: "0.9rem" }}>
                    Your feedback helps us improve the AI-CPA system and enhance clinical decision support
                  </div>
                </div>
                
                <div style={{ padding: "1.5rem", background: "#ffffff", borderRadius: "12px", border: "1px solid #e5e7eb" }}>
                  <div style={{ color: "#6B7280", textAlign: "center", padding: "2rem" }}>
                    Feedback form will be implemented here.
                    <br />
                    <small style={{ fontSize: "0.85rem" }}>This will include questions about prediction usefulness, accuracy, and workflow impact.</small>
                  </div>
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


