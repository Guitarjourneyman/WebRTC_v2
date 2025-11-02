import React, { useEffect } from "react";

const Timer = (props) => {
    useEffect(() => {
        const timer = setInterval(() => {
            console.log('Timer is running...');
        }, 1000);

        // Cleanup interval on unmount
        // On & Off 상태 
        // return () => clearInterval(timer);
    }, []); // empty dependency array 

    return (
        <div>
            <span>Timer Start Look at the console ! </span>
        </div>
    );
};

export default Timer;