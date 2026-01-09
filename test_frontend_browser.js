/**
 * Browser Console Script to Test Frontend with test_patient_risky.json
 * 
 * Usage:
 * 1. Open your browser's developer console (F12)
 * 2. Navigate to the dashboard page (you should be logged in)
 * 3. Copy and paste this entire script into the console
 * 4. The script will load the test data and make a prediction request
 * 
 * Or use this with fetch directly if you have the API base URL:
 * - Modify API_BASE_URL below
 * - You may need to set AUTH_TOKEN if testing against backend directly
 */

(async function() {
    console.log("🧪 Starting Frontend Integration Test...");
    console.log("=" .repeat(60));
    
    // Configuration - adjust these if needed
    // In browser, we can't access process.env, so use default or extract from window
    // Try to get API base URL - defaults to localhost:8000
    // To override, manually set: window.TEST_API_BASE_URL = "http://your-backend-url:8000";
    let API_BASE_URL = (typeof window !== 'undefined' && window.TEST_API_BASE_URL) 
        ? window.TEST_API_BASE_URL 
        : "http://localhost:8000"; // Default backend URL
    
    // If frontend is on localhost:3000, backend is typically on localhost:8000
    // Adjust if your setup is different
    console.log(`🔧 Using API Base URL: ${API_BASE_URL}`);
    console.log(`   💡 To override, set: window.TEST_API_BASE_URL = "http://your-backend-url:8000"`);
    console.log();
    
    // Test patient data (from test_patient_risky.json)
    const testPatientData = {
        "resourceType": "Patient",
        "id": "TEST_RISKY_001",
        "anchor_age": 78,
        "gender": "M",
        "race": "White",
        "insurance": "Medicaid",
        "marital_status": "Single",
        "admission_type": "Emergency",
        "admission_location": "ICU",
        "ward": "ICU",
        "num_admissions": 5,
        "avg_los_days": 7.0,
        "los_days": 6,
        "ever_died_in_hospital": 0,
        "vital_heart_rate": 128,
        "vital_respiratory_rate": 32,
        "vital_temperature_celsius": 39.2,
        "vital_spo2": 85,
        "vital_arterial_blood_pressure_systolic": 85,
        "vital_arterial_blood_pressure_diastolic": 45,
        "vital_arterial_blood_pressure_mean": 58,
        "on_oxygen": true,
        "on_dialysis": true,
        "on_ventilator": true,
        "on_vasopressors": true,
        "lab_creatinine": 5.2,
        "lab_egfr": 10,
        "lab_hemoglobin": 8.5,
        "lab_white_blood_cells": 22.0,
        "lab_platelet_count": 70,
        "lab_sodium": 128,
        "lab_potassium": 6.2,
        "lab_alt": 120,
        "lab_ast": 110,
        "lab_bilirubin": 2.0,
        "lab_alp": 150,
        "lab_magnesium": 1.2,
        "lab_phosphate": 6.0,
        "lab_glucose": 240,
        "lab_urea_nitrogen": 65,
        "lab_bicarbonate": 14,
        "aki": true,
        "chronic_liver_disease": true,
        "comorbidities": [
            "Chronic Kidney Disease Stage 5",
            "Septic Shock",
            "Pneumonia",
            "Hypertension",
            "Type 2 Diabetes Mellitus",
            "Congestive Heart Failure",
            "COPD",
            "Cirrhosis of liver"
        ],
        "total_diagnoses": 8,
        "total_procedures": 3,
        "selected_drugs": [
            "Acetaminophen",
            "Cisplatin"
        ],
        // Map comorbidities to boolean fields (frontend format)
        "hypertension": true,
        "diabetes_type1": false,
        "diabetes_type2": true,
        "cad_hf": true,
        "ckd": true,
        "copd_asthma": true,
        "malignancy": false,
        "immunosuppressed": false
    };
    
    try {
        console.log("📋 Test Patient Data:");
        console.log(`   - Age: ${testPatientData.anchor_age}`);
        console.log(`   - Gender: ${testPatientData.gender}`);
        console.log(`   - Selected Drugs: ${testPatientData.selected_drugs.join(", ")}`);
        console.log();
        
        // Get authentication token from localStorage (same key as frontend uses)
        const token = typeof window !== 'undefined' ? localStorage.getItem("ai_cpa_token") : null;
        
        // Prepare headers
        const headers = {
            "Content-Type": "application/json"
        };
        
        if (token) {
            headers["Authorization"] = `Bearer ${token}`;
        }
        
        console.log(`📤 Sending request to: ${API_BASE_URL}/api/predictions/predict`);
        if (token) {
            console.log("   ✅ Using authentication token from localStorage");
        } else {
            console.log("   ⚠️  No authentication token found in localStorage");
            console.log("   💡 Make sure you're logged in to the frontend first!");
        }
        console.log();
        
        // Make the request using fetch
        const fetchResponse = await fetch(`${API_BASE_URL}/api/predictions/predict`, {
            method: "POST",
            headers: headers,
            body: JSON.stringify({ patient_data: testPatientData })
        });
        
        if (!fetchResponse.ok) {
            let errorText;
            try {
                const errorJson = await fetchResponse.json();
                errorText = errorJson.detail || JSON.stringify(errorJson);
            } catch {
                errorText = await fetchResponse.text();
            }
            throw new Error(`Request failed (${fetchResponse.status}): ${errorText}`);
        }
        
        const response = await fetchResponse.json();
        
        console.log();
        console.log("✅ Prediction successful!");
        console.log("📊 Results:");
        console.log(`   Risk Score: ${response.risk_score} (${(response.risk_score * 100).toFixed(2)}%)`);
        console.log(`   Risk Category: ${response.risk_category}`);
        console.log(`   Timestamp: ${response.timestamp}`);
        
        if (response.drug_analysis && response.drug_analysis.top_drugs) {
            console.log();
            console.log("💊 Drug Analysis:");
            response.drug_analysis.top_drugs.slice(0, 5).forEach(([drugName, drugInfo]) => {
                const adrRate = (drugInfo.adr_rate * 100).toFixed(3);
                const severeRate = (drugInfo.severe_rate * 100).toFixed(2);
                const count = drugInfo.count || 0;
                console.log(`   - ${drugName}: ADR ${adrRate}% | Severe ${severeRate}% | Count ${count}`);
            });
        }
        
        if (response.shap_top_contributors) {
            console.log();
            console.log("🔍 Top SHAP Contributors:");
            response.shap_top_contributors.slice(0, 5).forEach(contrib => {
                console.log(`   - ${contrib.feature}: ${contrib.shap_value.toFixed(4)}`);
            });
        }
        
        if (response.recommendations) {
            console.log();
            console.log("💡 Recommendations:");
            response.recommendations.slice(0, 3).forEach(rec => {
                console.log(`   - ${rec}`);
            });
        }
        
        console.log();
        console.log("=" .repeat(60));
        console.log("✅ Test completed successfully!");
        console.log("=" .repeat(60));
        
        // Store result in window for inspection
        window.testPredictionResult = response;
        console.log("💾 Result stored in window.testPredictionResult");
        
        return response;
        
    } catch (error) {
        console.error();
        console.error("❌ Error during test:");
        console.error(error);
        console.error();
        console.error("=" .repeat(60));
        console.error("❌ Test failed!");
        console.error("=" .repeat(60));
        throw error;
    }
})();
