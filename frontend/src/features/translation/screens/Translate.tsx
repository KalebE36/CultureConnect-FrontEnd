// src/pages/HomeScreen.tsx (example)

import React, { useState } from "react";

export default function HomeScreen() {
  const [textToTranslate, setTextToTranslate] = useState("");
  const [translatedText, setTranslatedText] = useState("");
  const [sourceLang, setSourceLang] = useState("en"); // default: English
  const [targetLang, setTargetLang] = useState("es"); // default: Spanish
  const [error, setError] = useState("");

  const handleTranslate = async () => {
    try {
      setError("");
      setTranslatedText("Translating...");

      // Construct the Lingva Translate endpoint
      // Example: https://lingva.ml/api/v1/en/es/Hello
      const url = `https://lingva.ml/api/v1/${sourceLang}/${targetLang}/${encodeURIComponent(
        textToTranslate
      )}`;

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }

      // Lingva response format:
      // {
      //   "translation": "Hola",
      //   "phonetic": "",    // May or may not exist
      //   "definitions": []  // May or may not exist
      // }
      const data = await response.json();
      setTranslatedText(data.translation || "No translation found.");
    } catch (err: any) {
      setError(err.message || "Failed to fetch translation.");
      setTranslatedText("");
    }
  };

  return (
    <main className="p-4">
      <h3 className="text-xl font-bold mb-4">Lingva Translate Demo</h3>

      <div className="mb-4">
        <label htmlFor="sourceLang" className="block mb-2">
          Source Language:
        </label>
        <select
          id="sourceLang"
          className="border p-2"
          value={sourceLang}
          onChange={(e) => setSourceLang(e.target.value)}
        >
          <option value="en">English</option>
          <option value="es">Spanish</option>
          <option value="fr">French</option>
          <option value="de">German</option>
          <option value="ru">Russian</option>
          {/* add more as needed */}
        </select>
      </div>

      <div className="mb-4">
        <label htmlFor="targetLang" className="block mb-2">
          Target Language:
        </label>
        <select
          id="targetLang"
          className="border p-2"
          value={targetLang}
          onChange={(e) => setTargetLang(e.target.value)}
        >
          <option value="en">English</option>
          <option value="es">Spanish</option>
          <option value="fr">French</option>
          <option value="de">German</option>
          <option value="ru">Russian</option>
          {/* add more as needed */}
        </select>
      </div>

      <div className="mb-4">
        <label htmlFor="textToTranslate" className="block mb-2">
          Text to Translate:
        </label>
        <input
          id="textToTranslate"
          type="text"
          className="border p-2 w-full"
          value={textToTranslate}
          onChange={(e) => setTextToTranslate(e.target.value)}
        />
      </div>

      <button
        className="bg-blue-500 text-white py-2 px-4 rounded hover:bg-blue-600"
        onClick={handleTranslate}
      >
        Translate
      </button>

      {error && (
        <p className="text-red-500 mt-4">
          Error: {error}
        </p>
      )}

      {translatedText && !error && (
        <p className="mt-4">
          <strong>Result:</strong> {translatedText}
        </p>
      )}
    </main>
  );
}
