"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { getToken } from "@/lib/auth";
import { motion, Variants } from "framer-motion";
import Image from "next/image";

export default function LandingPage() {
  const router = useRouter();
  useEffect(() => {
    if (!getToken()) router.replace("/auth");
  }, [router]);

  const containerVariants: Variants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
        delayChildren: 0.2,
      },
    },
  };

  const itemVariants: Variants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
    },
  };


  const features = [
    {
      title: "Advanced ML Models",
      text: "XGBoost, Random Forest, and Logistic Regression models with hyperparameter tuning and cross-validation for robust ADR prediction.",
      gradientClass: "feature-gradient-1",
      icon: "/neural-network-Stroke-Rounded.png",
    },
    {
      title: "SHAP Explainability",
      text: "Local and global SHAP explanations for every prediction with clear feature importance visualization for clinicians.",
      gradientClass: "feature-gradient-2",
      icon: "/analytics-03-Stroke-Rounded.png",
    },
    {
      title: "Bias Auditing",
      text: "Systematic fairness evaluation across age, sex, and key subgroups to reduce algorithmic bias and support equitable care.",
      gradientClass: "feature-gradient-3",
      icon: "/user-shield-01-Stroke-Rounded.png",
    },
    {
      title: "FHIR Compliance",
      text: "Built with FHIR-compliant data structures and exports for seamless integration into existing EMR and hospital systems.",
      gradientClass: "feature-gradient-4",
      icon: "/document-validation-Stroke-Rounded.png",
    },
    {
      title: "Multi-Source Data",
      text: "Trained on MIMIC-IV, FAERS, and synthetic Indian hospital datasets for broad coverage of real-world prescribing patterns.",
      gradientClass: "feature-gradient-5",
      icon: "/database-lightning-Stroke-Rounded.png",
    },
    {
      title: "Clinical Focus",
      text: "Optimized for Indian hospital workflows with support for local drug brands and pharmacist-first decision support.",
      gradientClass: "feature-gradient-6",
      icon: "/heart-check-Stroke-Rounded.png",
    },
  ];

  return (
    <div className="landing-page">
      {/* DNA Background Element */}
      <div className="dna-background">
        <div className="dna-image-wrapper">
          <motion.div
            animate={{
              y: [0, -8, 0],
            }}
            transition={{
              duration: 8,
              repeat: Infinity,
              ease: "easeInOut",
            }}
            style={{
              width: "100%",
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Image
              src="/DNA.png"
              alt="DNA"
              width={3000}
              height={3000}
              className="dna-image"
              priority
              unoptimized
              style={{ objectFit: 'cover' }}
            />
          </motion.div>
        </div>
        <div className="gradient-overlay"></div>
      </div>

      {/* Hero Section */}
      <motion.section
        className="hero-section"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        <motion.div 
          className="hero-container" 
          variants={itemVariants}
          transition={{
            duration: 0.6,
            ease: "easeOut",
          }}
        >
          <motion.div
            className="hero-logo"
            animate={{
              y: [0, -8, 0],
            }}
            transition={{
              duration: 8,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          >
            <div className="hero-logo-glow">
              <Image
                src="/brain-ai-3-line.png"
                alt="AI-CPA Logo"
                width={128}
                height={128}
                className="hero-logo-icon"
                priority
              />
            </div>
          </motion.div>
          
          <motion.h1 className="hero-title" variants={itemVariants}>
            AI-CPA
          </motion.h1>
          
          <motion.h2 className="hero-subtitle" variants={itemVariants}>
            Clinical Pharmacist Assistant
          </motion.h2>
          
          <motion.p className="hero-description" variants={itemVariants}>
            Advanced AI-powered system for predicting Adverse Drug Reactions (ADRs) in Indian hospitals. Built with
            explainable AI, FHIR compliance, and bias auditing for safe clinical decision support.
          </motion.p>

          <motion.div className="hero-actions" variants={itemVariants}>
            <motion.button
              className="hero-primary-btn"
              onClick={() => router.push("/dashboard")}
              whileHover={{ scale: 1.05, y: -2 }}
              whileTap={{ scale: 0.98 }}
            >
              <span>Get Started</span>
            </motion.button>
            <motion.button
              className="hero-secondary-btn"
              onClick={() => router.push("/dashboard")}
              whileHover={{ scale: 1.05, y: -2 }}
              whileTap={{ scale: 0.98 }}
            >
              Learn More
            </motion.button>
          </motion.div>
        </motion.div>
      </motion.section>

      {/* Features Section */}
      <motion.section
        className="feature-section"
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true, margin: "-100px" }}
        transition={{ duration: 0.8 }}
      >
        <div className="feature-grid">
          {features.map((feature, index) => (
            <motion.div
              key={index}
              className={`feature-card ${feature.gradientClass}`}
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{ duration: 0.6, delay: index * 0.1 }}
              whileHover={{ y: -8, scale: 1.02 }}
            >
              <div className="feature-icon-wrapper">
                <div className="feature-icon-glow">
                  <Image
                    src={feature.icon}
                    alt={feature.title}
                    width={48}
                    height={48}
                    className="feature-icon-img"
                  />
                </div>
              </div>
              <h3 className="feature-title">{feature.title}</h3>
              <p className="feature-text">{feature.text}</p>
            </motion.div>
          ))}
        </div>
      </motion.section>

      {/* CTA Section */}
      <motion.section
        className="cta-section"
        initial={{ opacity: 0, y: 40 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-100px" }}
        transition={{ duration: 0.8 }}
      >
        <div className="cta-card">
          <motion.h2
            className="cta-title"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            Ready to Enhance Patient Safety?
          </motion.h2>
          <motion.p
            className="cta-text"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.1 }}
          >
            Start using AI-CPA to predict and prevent adverse drug reactions in your clinical practice.
          </motion.p>
          <motion.button
            className="cta-button"
            onClick={() => router.push("/dashboard")}
            whileHover={{ scale: 1.05, y: -2 }}
            whileTap={{ scale: 0.98 }}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            Start Using AI-CPA
          </motion.button>
        </div>
      </motion.section>
    </div>
  );
}
