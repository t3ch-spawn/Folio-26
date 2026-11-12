import { useEffect, useState } from "react";

function useLiveTime() {
  const [time, setTime] = useState("");

  useEffect(() => {
    const updateTime = () => {
      const d = new Date();

      const clock = d.toLocaleTimeString("en-GB", {
        hour12: false,
      });

      const offset = -d.getTimezoneOffset() / 60;

      setTime(
        `${clock} GMT ${offset >= 0 ? "+" : ""}${offset}`
      );
    };

    updateTime(); // initial call

    const interval = setInterval(updateTime, 1000);

    return () => clearInterval(interval);
  }, []);

  return time;
}

export default useLiveTime;
