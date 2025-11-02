import React, { useState, useRef, useEffect, useCallback } from 'react';

// Promise 란? : 비동기 작업의 완료 또는 실패를 나타내는 객체
// resolve : 작업이 성공적으로 완료되었음을 알리는 함수
// reject : 작업이 실패했음을 알리는 함수
/*

Promise나 다른 문법을 사용해서 A함수에서 await를 이용하여 B함수를 호출하고 
B함수에서 의존성 배열의 상태가 True로 바뀌었을 때 return 하고 A함수에서 await 구문 밑을 수행하도록 하는 방법

*/

function StateAwaitExample() {
  // B 함수가 변경할 상태. 이 상태가 true가 되면 await가 풀립니다.
  const [isTaskBComplete, setIsTaskBComplete] = useState(false);

  // Promise의 resolve 함수를 렌더링 사이에서 보관하기 위한 ref
  const promiseResolverRef = useRef<((value: unknown) => void) | null>(null);

  // 1. A 함수가 await 할 Promise를 생성하는 함수
  const waitForTaskB = useCallback(() => {
    // 이미 상태가 완료되었다면 즉시 resolve
    console.log(" waitForTaskB 호출됨, isTaskBComplete:", isTaskBComplete);
    if (isTaskBComplete) {
      return Promise.resolve(true);
    }
    // resolve함수는 끝났다는 버튼과 같음   
    return new Promise((resolve) => {
      // resolve 함수를 ref에 저장
      promiseResolverRef.current = resolve;
    });
  }, [isTaskBComplete]);

  // 2. useEffect를 사용하여 상태 변경 감지 및 Promise 해결
  useEffect(() => {
    // isTaskBComplete 상태가 true로 바뀌었고, 대기 중인 resolve 함수가 있다면
    if (isTaskBComplete && promiseResolverRef.current) {
      console.log("useEffect: isTaskBComplete가 true가 되어 Promise를 resolve합니다.");
      promiseResolverRef.current(true); // ref에 저장된 resolve 함수 실행
      promiseResolverRef.current = null;  // 실행 후 ref 정리
    }
  }, [isTaskBComplete]); // isTaskBComplete 상태를 의존성 배열에 넣음

  // A 함수: B의 완료를 기다렸다가 다음 작업을 수행
  const functionA = async () => {
    console.log("A: 작업 B가 완료되기를 기다립니다...");
    // waitForTaskB가 반환한 Promise를 기다림
    await waitForTaskB();
    console.log("A: 작업 B 완료! 다음 로직을 실행합니다.");
    // 여기에 B가 완료된 후 실행할 코드를 작성
  };

  // 버튼 클릭 시 즉시 상태를 true로 변경
  const functionB = () => {
    console.log("B: isTaskBComplete 상태를 true로 변경합니다.");
    setIsTaskBComplete(true);
  };
  
  // 상태 리셋 함수
  const handleReset = () => {
    setIsTaskBComplete(false);
    promiseResolverRef.current = null;
    console.log("상태가 리셋되었습니다.");
  };

  return (
    <div>
      <h2>State와 Promise를 이용한 Await 구현</h2>
      <p>현재 B 완료 상태: {isTaskBComplete ? '완료' : '대기 중'}</p>
      {/* A와 B를 실행하는 버튼들은 이전과 동일합니다 */}
      <button onClick={functionA}>A 함수 실행 (B 기다리기)</button>
      <button onClick={functionB} disabled={isTaskBComplete}>B 함수 실행 (상태 변경)</button>
      <button onClick={handleReset}>리셋</button>
      <div style={{ marginTop: '10px', fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
        <p>
          <strong>실행 순서:</strong><br />
          1. 'A 함수 실행' 버튼 클릭<br />
          2. 'B 함수 실행' 버튼 클릭<br />
          3. 콘솔 로그에서 'A 함수'의 await가 즉시 풀리는 것을 확인
        </p>
      </div>
    </div>
  );
}

export default StateAwaitExample;