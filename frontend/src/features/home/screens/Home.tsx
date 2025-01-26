import { useNavigate } from "react-router-dom";
import Ellipse1 from "../img/Ellipse_1.png";
import Ellipse2 from "../img/Ellipse_2.png";
import globly from "../img/glob.png";
import { useAuth } from "../../auth/hooks/useAuth";

export default function LoginScreen() {
  const navigate = useNavigate();
  const { user } = useAuth(); // Access the authenticated user from useAuth

  const handleGetStarted = () => {
    if (user) {
      // If authenticated, navigate to /camera
      navigate("/camera");
    } else {
      // Otherwise, navigate to /login
      navigate("/login");
    }
  };

  return (
    <div className="relative flex flex-col justify-center min-h-screen bg-gradient-to-b from-blue-200 to-blue-300 font-roboto px-4 md:px-12">
      {/* Ellipses (Hidden on smaller screens, shown on md+) */}
      <img
        src={Ellipse1}
        alt="Left Ellipse"
        className="hidden md:block absolute w-3/12 top-0 left-0"
      />
      <img
        src={Ellipse2}
        alt="Bottom Ellipse"
        className="hidden md:block absolute w-5/12 bottom-0 right-0"
      />

      {/* Header */}
      <div className="absolute top-5 left-5 text-black text-lg md:text-xl font-bold">
        CultureConnect
      </div>

      {/* Main Content */}
      <div className="flex flex-col items-start space-y-4 mt-12 md:mt-0 md:ml-36">
        <h1 className="text-4xl md:text-6xl font-bold text-white mb-2 leading-snug">
          Your home away <br /> from home
        </h1>
        <p className="text-white text-sm md:text-base max-w-md">
          Blah Blah Blah short introduction. This is the introductory paragraph 
          giving an understanding of the purpose of this application.
        </p>
        <button
          onClick={handleGetStarted} // Use the handler to conditionally navigate
          className="px-6 py-3 bg-green-500 text-white rounded-lg font-medium hover:bg-green-600 transition"
        >
          Get Started
        </button>
      </div>

      {/* Globe Graphic (Hidden on smaller screens by default if you want) */}
      <div className="hidden md:block absolute bottom-[5vw] right-[-28vw]">
        <img
          src={globly}
          alt="Earth with a light bulb"
          className="w-5/12 h-auto"
        />
      </div>
    </div>
  );
}
