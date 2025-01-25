import { Routes, Route } from 'react-router-dom';
import LoginScreen from '../features/login/screens/Login';
import HomeScreen from '../features/home/screens/Home';

function App() {
  return (
    <>
      <Routes>
            <Route path="/" element={<HomeScreen />} />
            <Route path="/login" element={<LoginScreen/>} />
      </Routes>
    </>
  );
}

export default App;
