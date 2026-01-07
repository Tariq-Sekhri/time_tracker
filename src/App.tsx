import "./App.css";
import Calendar from "./Componants/Calendar.tsx";
import Temp from "./Componants/temp.tsx"

export default function App() {
    return (
        <main className="bg-black text-white">
            <Calendar/>
            <Temp/>
        </main>
    );
}
