"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { clearAuth, getToken, getUser, User } from "@/lib/auth";
import { RiskGauge } from "@/components/RiskGauge";
import Image from "next/image";

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
    weight: 70,
    height: 170,
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
    lab_platelet_count: 250,
    lab_alt: 25,
    lab_ast: 30,
    lab_bilirubin: 0.8,
    lab_egfr: 90,
    lab_alp: 70,
    // vitals
    vital_heart_rate: 72,
    vital_respiratory_rate: 16,
    vital_temperature_celsius: 37.0,
    vital_spo2: 98,
    vital_arterial_blood_pressure_systolic: 120,
    vital_arterial_blood_pressure_diastolic: 80,
    vital_arterial_blood_pressure_mean: 93
  });

  const [medName, setMedName] = useState("");
  const [prediction, setPrediction] = useState<PredictionResponse | null>(null);
  const [predicting, setPredicting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadMethod, setUploadMethod] = useState<"manual" | "json" | "csv">("manual");
  const [uploadFile, setUploadFile] = useState<File | null>(null);

  // History/admin
  const [history, setHistory] = useState<RecordOut[]>([]);
  const [adminRecords, setAdminRecords] = useState<any[]>([]);
  const [metrics, setMetrics] = useState<any | null>(null);

  useEffect(() => {
    if (!getToken()) router.replace("/auth");
    setUser(getUser());
  }, [router]);

  // Auto-redirect to ADR Predictions tab when prediction is set
  useEffect(() => {
    if (prediction && tab !== "ADR Predictions") {
      setTab("ADR Predictions");
      // Smooth scroll to top after tab switch
      setTimeout(() => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }, 150);
    }
  }, [prediction, tab]);

  const stats = useMemo(() => {
    const patients = prediction ? 1 : 0;
    const medications = (patientData.selected_drugs || []).length;
    const predictions = prediction ? 1 : 0;
    const labs = patientData.lab_creatinine != null ? 1 : 0;
    return { patients, medications, predictions, labs };
  }, [patientData, prediction]);

  async function runPredictionJSON() {
    setError(null);
    setPredicting(true);
    try {
      const res = await apiFetch<PredictionResponse>("/api/predictions/predict", {
        method: "POST",
        json: { patient_data: patientData }
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
                  <div className="row2" style={{ marginTop: "0.75rem" }}>
                    <div className="field">
                      <label>Age (years)</label>
                      <input
                        type="number"
                        value={patientData.anchor_age}
                        onChange={(e) => setPatientData({ ...patientData, anchor_age: Number(e.target.value) })}
                      />
                    </div>
                    <div className="field">
                      <label>Sex</label>
                      <input
                        value={patientData.gender}
                        onChange={(e) => setPatientData({ ...patientData, gender: e.target.value })}
                        placeholder="M / F / O"
                      />
                    </div>
                  </div>
                </details>

                <details>
                  <summary style={{ fontWeight: 800, cursor: "pointer" }}>2. Clinical Vitals & Organ Status</summary>
                  <div className="row2" style={{ marginTop: "0.75rem" }}>
                    <div className="field">
                      <label>Heart Rate (bpm)</label>
                      <input
                        type="number"
                        value={patientData.vital_heart_rate}
                        onChange={(e) => setPatientData({ ...patientData, vital_heart_rate: Number(e.target.value) })}
                      />
                    </div>
                    <div className="field">
                      <label>Resp. Rate (bpm)</label>
                      <input
                        type="number"
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
                        value={patientData.vital_spo2}
                        onChange={(e) => setPatientData({ ...patientData, vital_spo2: Number(e.target.value) })}
                      />
                    </div>
                  </div>
                  <div style={{ marginTop: "0.75rem" }}>
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
                </details>

                <details>
                  <summary style={{ fontWeight: 800, cursor: "pointer" }}>3. Laboratory Results (ADR-Relevant)</summary>
                  <div className="row2" style={{ marginTop: "0.75rem" }}>
                    <div className="field">
                      <label>Creatinine (mg/dL)</label>
                      <input
                        type="number"
                        value={patientData.lab_creatinine}
                        onChange={(e) => setPatientData({ ...patientData, lab_creatinine: Number(e.target.value) })}
                      />
                    </div>
                    <div className="field">
                      <label>Hemoglobin (g/dL)</label>
                      <input
                        type="number"
                        value={patientData.lab_hemoglobin}
                        onChange={(e) => setPatientData({ ...patientData, lab_hemoglobin: Number(e.target.value) })}
                      />
                    </div>
                    <div className="field">
                      <label>WBC (K/uL)</label>
                      <input
                        type="number"
                        value={patientData.lab_white_blood_cells}
                        onChange={(e) => setPatientData({ ...patientData, lab_white_blood_cells: Number(e.target.value) })}
                      />
                    </div>
                    <div className="field">
                      <label>Platelets (K/uL)</label>
                      <input
                        type="number"
                        value={patientData.lab_platelet_count}
                        onChange={(e) => setPatientData({ ...patientData, lab_platelet_count: Number(e.target.value) })}
                      />
                    </div>
                  </div>
                </details>

                <details>
                  <summary style={{ fontWeight: 800, cursor: "pointer" }}>4. Comorbidities (Structured)</summary>
                  <div style={{ marginTop: "0.75rem", display: "grid", gap: "0.35rem" }}>
                    {["Hypertension", "Diabetes", "CKD", "Heart Failure", "Asthma/COPD", "Chronic Liver Disease", "Malignancy", "Immunosuppression"].map(
                      (c) => (
                        <label key={c} style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                          <input
                            type="checkbox"
                            checked={(patientData.comorbidities || []).includes(c)}
                            onChange={(e) => {
                              const cur = new Set<string>(patientData.comorbidities || []);
                              if (e.target.checked) cur.add(c);
                              else cur.delete(c);
                              setPatientData({ ...patientData, comorbidities: Array.from(cur) });
                            }}
                          />
                          {c}
                        </label>
                      )
                    )}
                  </div>
                </details>

                <details open style={{ marginTop: "1rem" }}>
                  <summary style={{ fontWeight: 800, cursor: "pointer" }}>5. Medication Profile (MOST IMPORTANT)</summary>
                  <div style={{ marginTop: "0.75rem" }}>
                    <div className="row2">
                      <div className="field">
                        <label>Generic Name</label>
                        <input value={medName} onChange={(e) => setMedName(e.target.value)} />
                      </div>
                      <div className="field">
                        <label>&nbsp;</label>
                        <button
                          className="btn-primary"
                          onClick={() => {
                            if (!medName.trim()) return;
                            setPatientData({
                              ...patientData,
                              selected_drugs: [...(patientData.selected_drugs || []), medName.trim()]
                            });
                            setMedName("");
                          }}
                        >
                          <Image src="/plus-sign-square-Stroke-Rounded.png" alt="Add" width={18} height={18} style={{ display: 'inline-block', marginRight: '0.5rem', verticalAlign: 'middle' }} />
                          Add Drug
                        </button>
                      </div>
                    </div>

                    <div style={{ marginTop: "0.75rem" }}>
                      <b>Current Medications ({(patientData.selected_drugs || []).length})</b>
                      <div style={{ marginTop: "0.5rem", display: "grid", gap: "0.4rem" }}>
                        {(patientData.selected_drugs || []).map((d: string, idx: number) => (
                          <div key={idx} style={{ display: "flex", justifyContent: "space-between", gap: "0.75rem" }}>
                            <div>
                              <Image src="/medicine-02-Stroke-Rounded.png" alt="Medicine" width={18} height={18} style={{ display: 'inline-block', marginRight: '0.5rem', verticalAlign: 'middle' }} />
                              {d}
                            </div>
                            <button
                              className="sidebar-btn"
                              onClick={() => {
                                const next = [...patientData.selected_drugs];
                                next.splice(idx, 1);
                                setPatientData({ ...patientData, selected_drugs: next });
                              }}
                              style={{ padding: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                            >
                              <Image src="/cancel-square-Stroke-Rounded.png" alt="Remove" width={18} height={18} />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
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
                          Based on {(patientData.selected_drugs || []).length} medications and current lab values
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
                <div style={{ color: "#6B7280" }}>
                  This tab is preserved. The detailed SHAP visualizations can be added next (waterfall/summary plots).
                </div>
              </div>
            ) : null}

            {tab === "Bias Audit" ? (
              <div className="panel">
                <h3 style={{ marginTop: 0 }}>Model Performance & Analytics (Bias Audit)</h3>
                <button className="sidebar-btn" onClick={loadMetrics}>
                  Load Metrics
                </button>
                {metrics ? (
                  <div style={{ marginTop: "1rem", display: "grid", gap: "0.35rem" }}>
                    <div>AUC-ROC: <b>{Number(metrics.auc_roc).toFixed(3)}</b></div>
                    <div>Precision: <b>{Number(metrics.precision).toFixed(3)}</b></div>
                    <div>Recall: <b>{Number(metrics.recall).toFixed(3)}</b></div>
                    <div>F1: <b>{Number(metrics.f1).toFixed(3)}</b></div>
                  </div>
                ) : null}
                <div style={{ marginTop: "1rem" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                    <div>
                      <b>Confusion Matrix</b>
                      <img
                        src={`${process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000"}/reports/confusion_matrix.png`}
                        alt="confusion_matrix"
                        style={{ width: "100%", borderRadius: 12, border: "1px solid #E5E7EB", marginTop: 8 }}
                      />
                    </div>
                    <div>
                      <b>ROC Curve</b>
                      <img
                        src={`${process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000"}/reports/roc_curve.png`}
                        alt="roc_curve"
                        style={{ width: "100%", borderRadius: 12, border: "1px solid #E5E7EB", marginTop: 8 }}
                      />
                    </div>
                    <div>
                      <b>Fairness (AUC)</b>
                      <img
                        src={`${process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000"}/reports/fairness_auc.png`}
                        alt="fairness_auc"
                        style={{ width: "100%", borderRadius: 12, border: "1px solid #E5E7EB", marginTop: 8 }}
                      />
                    </div>
                    <div>
                      <b>Calibration</b>
                      <img
                        src={`${process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000"}/reports/calibration_curve.png`}
                        alt="calibration_curve"
                        style={{ width: "100%", borderRadius: 12, border: "1px solid #E5E7EB", marginTop: 8 }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            {tab === "Workflow Efficiency" ? (
              <div className="panel">
                <h3 style={{ marginTop: 0 }}>Workflow Efficiency</h3>
                <div style={{ color: "#6B7280" }}>
                  This section is preserved; next step is porting the simulated chart + feedback form exactly like Streamlit.
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


