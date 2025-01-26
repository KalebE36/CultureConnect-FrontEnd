import { useNavigate } from "react-router-dom";
import Ellipse1 from "../img/Ellipse_1.png";
import Ellipse2 from "../img/Ellipse_2.png";
import globly from "../img/glob.png";

export default function LoginScreen() {
  const navigate = useNavigate();


 

  return (
    <div className="flex flex-col justify-center min-h-screen bg-gradient-to-b from-blue-200 to-blue-300 relative font-roboto px-12">
      {/* White Ellipses */}
      <img
        src={Ellipse1}
        alt="Left Ellipse"
        className="absolute w-3/12 h-7/12 top-0 left-0"
      />
      <img
        src={Ellipse2}
        alt="Bottom Ellipse"
        className="absolute w-5/12 h-4/6 bottom-0 right-0"
      />

      {/* Header */}
      <div className="absolute top-5 left-5 text-black text-xl font-bold">
        CultureConnect
      </div>

      <div className="absolute top-5 right-5 text-black text-sm font-medium">
        LOGIN
      </div>

      {/* Content */}
      <div className="flex flex-col items-start space-y-6 ml-36">
        <h1 className="text-6xl font-bold text-white mb-2">
          Your home away <br /> from home
        </h1>
        <p className="text-white text-md max-w-md">
          Blah Blah Blah short introduction, this is the introductory paragraph
          sentence giving an understanding to the purpose of this application.
        </p>
        <button
          onClick={() => {
            navigate('/login')}
          }
          className="px-6 py-3 bg-green-500 text-white rounded-lg font-medium hover:bg-green-600 transition"
        >
          Get Started
        </button>
      </div>

      {/* Globe Graphic */}
      <div className="absolute bottom-[5vw] right-[-28vw]">
        <img
          src={globly}
          alt="Earth with a light bulb"
          className="h-5/12 w-5/12"
        />
      </div>
    </div>
  );
}
