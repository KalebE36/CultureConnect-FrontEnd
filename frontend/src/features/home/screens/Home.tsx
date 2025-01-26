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
      {/* Ellipse 1 (left/top). Visible on all breakpoints, smaller on mobile */}
      <img
        src={Ellipse1}
        alt="Left Ellipse"
        className="absolute w-1/2 xs:w-1/3 sm:w-1/4 md:w-3/12 h-auto top-0 left-0"
      />
      {/* Ellipse 2 (right/bottom). Visible on all breakpoints, smaller on mobile */}
      <img
        src={Ellipse2}
        alt="Bottom Ellipse"
        className="absolute w-2/3 xs:w-1/2 sm:w-1/3 md:w-5/12 h-auto bottom-0 right-0"
      />

      {/* Header */}
      <div className="absolute top-5 left-5 text-black text-base sm:text-lg md:text-xl font-bold">
        CultureConnect
      </div>

      {/* Main Content */}
      <div className="flex flex-col items-start space-y-4 mt-12 md:mt-0 md:ml-36 z-10">
        <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold text-white mb-2 leading-snug drop-shadow-lg">
          One World, <br /> One Conversation
        </h1>
        <p className="text-white text-sm sm:text-base md:text-lg max-w-md">
          Experience real-time video calls with instant language translation. 
          Connect with people from around the world and break down language barriers 
          to share culture, ideas, and meaningful conversations.
        </p>
        <button
          onClick={handleGetStarted}
          className="px-6 py-3 bg-green-500 text-white rounded-lg font-medium hover:bg-green-600 transition"
        >
          Connect Now!
        </button>
      </div>

      {/* Globe Graphic, now visible on mobile but smaller */}
      <div className="absolute bottom-5 right-0 w-1/2 sm:w-1/3 md:w-5/12 h-auto z-0">
        <img
          src={globly}
          alt="Earth with a light bulb"
          className="w-full h-auto"
        />
      </div>
    </div>
  );
}