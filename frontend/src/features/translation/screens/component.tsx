import React, { useEffect, useState } from "react";

interface LingvaTranslateProps {
  sourceLang: string;       // e.g. "en", "ru"
  targetLang: string;       // e.g. "es", "ru"
  textToTranslate: string;  // e.g. "Hello world!"
}

/**
 * LingvaTranslate automatically fetches a translation for given props.
 * Renders "Translating..." during fetch, or an error if something goes wrong.
 */
export function LingvaTranslate({
  sourceLang,
  targetLang,
  textToTranslate,
}: LingvaTranslateProps) {
  const [translatedText, setTranslatedText] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // If there's no text, clear translation and bail out.
    if (!textToTranslate) {
      setTranslatedText("");
      setError("");
      return;
    }

    // Construct the Lingva endpoint
    const url = `https://lingva.ml/api/v1/${sourceLang}/${targetLang}/${encodeURIComponent(
      textToTranslate
    )}`;

    // Start fetching
    setLoading(true);
    setError("");
    setTranslatedText("");

    fetch(url)
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(`HTTP error! Status: ${res.status}`);
        }
        return await res.json();
      })
      .then((data) => {
        // data.translation holds the translated text
        setTranslatedText(data.translation || "No translation found.");
      })
      .catch((err: any) => {
        setError(err.message || "Failed to fetch translation.");
      })
      .finally(() => {
        setLoading(false);
      });
  }, [sourceLang, targetLang, textToTranslate]);

  if (error) {
    return <p className="text-red-500">Error: {error}</p>;
  }
  if (loading) {
    return <p>Translating...</p>;
  }
  if (translatedText) {
    return <p><strong>Result:</strong> {translatedText}</p>;
  }
  return null;
}
