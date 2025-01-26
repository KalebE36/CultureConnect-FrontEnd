import { useNavigate } from "react-router-dom";

export default function HomeScreen() {
  const navigate = useNavigate();

  const goToCamera = () => {
    navigate("/camera");
  };

  return (
    <main>
      <h3>test test test</h3>
      <button
        onClick={goToCamera}
        className="py-2 px-4 bg-blue-500 text-white rounded hover:bg-blue-600"
      >
        Go to Camera
      </button>
    </main>
  );
}
