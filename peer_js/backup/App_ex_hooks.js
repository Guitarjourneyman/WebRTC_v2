import React, { useEffect, useRef, useState, useCallback } from "react";
import Timer from "./component/Timer";

export default function App(){
  const [count, setCount] = useState(1);
  const [timer, setTimer] = useState(false);
  const [prevFunction, setPrevFunction] = useState(null);
  const countRef = useRef(1);
  let letCount = 1;
  // return 값이 있을 때와 없을 때의 차이도 
  let testcnt = 1;

  

  // useCallback : 함수가 재생성되는 것을 방지하기 위해 사용
  // 함수의 메모리 주소가 변경되지않고 동일하게 유지
  // useCallback이 반환한 함수가 testCallback에 할당
  // return과는 전혀 무관
  // dependency array에 있는 값이 변경될 때만 함수가 재정의됨 (실행 X, 실행은 호출 시점에)
  const testCallback = useCallback(() => {
    // const id = Math.random().toString(36).substr(2, 9); // generate random ID
    console.log("Callback executed",testcnt);
    (testcnt += 1);
  }, []
);
    
  // functional component : 함수형 컴포넌트
  function refUp(){
    countRef.current += 1;
  }

  function letUp1(){
    letCount += 1;
    console.log('letCount_1: ',letCount);
  }
  function letUp2(){
    letCount += 2;
    console.log('letCount_2: ',letCount);
  }
  function toggleTimer(){
    setTimer(!timer);
  }

  // UseEffect
  // dependency 있는 값이 변경될 때만 재실행
  useEffect(()=>{
    testCallback();
    setPrevFunction(testCallback);
    if (prevFunction !== null) {
        // 이전 함수와 현재 함수를 비교
        console.log("if :Is function the same?", prevFunction === testCallback);
    }
    else{
      // else로 빠지는 이유는 useEffect가 처음 실행될 때 prevFunction이 null이기 때문
      // 즉, 처음 실행될 때는 prevFunction이 없으므로 비교할 수 없음
      console.log("else: Is function the same?", prevFunction === testCallback);
    }
    
    console.log("Rendering... ");
  },[testCallback]);// dependency , 함수의 참조가 바뀔 때마다 실행됨

  console.log("Web pops up", letCount);

  return(
    // JSX(JS Xml) : JS내 HTML과 유사한 마크업을 가능하게 하는 React Componet UI적으로 선언적으로 표현하기 위함
    // <div>: combine multiple elements
    // <p> : paragraph tag rendering current value on the screen 
    <div>
      <p>Count - useState: {count}</p>
      <p>Count - useRef: {countRef.current}</p>
      <p>Count - let: {letCount}</p>
      <button onClick={() => setCount(count + 1)}>Count Up: useState</button>
      <button onClick={() => (refUp())}>Count Up: useRef</button>
      <button onClick={() => (letUp1())}>Count Up: let1</button>
      <button onClick={() => (letUp2())}>Count Up: let2</button>
      <button onClick={() => testCallback()}>Count Up: testCallback</button>
      {/* if time is ture, show Timer component */}
      {timer && <Timer /> }<button onClick={() => (toggleTimer())}>Toggle Timer</button>
    </div>
  );
}