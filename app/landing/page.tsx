"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { getToken } from "@/lib/auth";

export default function LandingPage() {
  const router = useRouter();
  useEffect(() => {
    if (!getToken()) router.replace("/auth");
  }, [router]);

  return (
    <div className="emoji-bg">
      <div className="hero-container">
        <div className="hero-logo">
          <div className="hero-logo-icon">🧠</div>
        </div>
        <div className="hero-title">AI-CPA</div>
        <div className="hero-subtitle">Clinical Pharmacist Assistant</div>
        <p className="hero-description">
          Advanced AI-powered system for predicting Adverse Drug Reactions (ADRs) in Indian hospitals. Built with
          explainable AI, FHIR compliance, and bias auditing for safe clinical decision support.
        </p>

        <div className="hero-actions">
          <button className="hero-primary-btn" onClick={() => router.push("/dashboard")}>
            ⚡ Get Started
          </button>
          <button className="hero-secondary-btn" onClick={() => router.push("/dashboard")}>
            Learn More
          </button>
        </div>
      </div>

      <div className="feature-section">
        <div className="feature-grid">
          <div className="feature-card">
            <div className="feature-icon" style={{ background: "#ECFDF5", color: "#16A34A" }}>
              🌲
            </div>
            <div className="feature-title">Advanced ML Models</div>
            <div className="feature-text">
              XGBoost, Random Forest, and Logistic Regression models with hyperparameter tuning and cross-validation for
              robust ADR prediction.
            </div>
          </div>

          <div className="feature-card">
            <div className="feature-icon" style={{ background: "#EEF2FF", color: "#4F46E5" }}>
              📊
            </div>
            <div className="feature-title">SHAP Explainability</div>
            <div className="feature-text">
              Local and global SHAP explanations for every prediction with clear feature importance visualization for
              clinicians.
            </div>
          </div>

          <div className="feature-card">
            <div className="feature-icon" style={{ background: "#FEF3C7", color: "#D97706" }}>
              🛡️
            </div>
            <div className="feature-title">Bias Auditing</div>
            <div className="feature-text">
              Systematic fairness evaluation across age, sex, and key subgroups to reduce algorithmic bias and support
              equitable care.
            </div>
          </div>

          <div className="feature-card">
            <div className="feature-icon" style={{ background: "#FFFBEB", color: "#EA580C" }}>
              📄
            </div>
            <div className="feature-title">FHIR Compliance</div>
            <div className="feature-text">
              Built with FHIR-compliant data structures and exports for seamless integration into existing EMR and
              hospital systems.
            </div>
          </div>

          <div className="feature-card">
            <div className="feature-icon" style={{ background: "#EFF6FF", color: "#2563EB" }}>
              🗄️
            </div>
            <div className="feature-title">Multi-Source Data</div>
            <div className="feature-text">
              Trained on MIMIC-IV, FAERS, and synthetic Indian hospital datasets for broad coverage of real-world
              prescribing patterns.
            </div>
          </div>

          <div className="feature-card">
            <div className="feature-icon" style={{ background: "#F5F3FF", color: "#7C3AED" }}>
              💜
            </div>
            <div className="feature-title">Clinical Focus</div>
            <div className="feature-text">
              Optimized for Indian hospital workflows with support for local drug brands and pharmacist-first decision
              support.
            </div>
          </div>
        </div>
      </div>

      <div className="cta-wrapper">
        <div className="cta-card">
          <div className="cta-title">Ready to Enhance Patient Safety?</div>
          <div className="cta-text">
            Start using AI-CPA to predict and prevent adverse drug reactions in your clinical practice.
          </div>
          <button className="hero-primary-btn" onClick={() => router.push("/dashboard")}>
            ⚡ Start Using AI-CPA
          </button>
        </div>
      </div>
    </div>
  );
}


