import numpy as np 
x= np.array([-1,2,1,-3])
R=np.maximum(0,x)
print(R)
S= 1/(1+np.exp(-x))
print(S)
tanh= np.tanh(x)
print(tanh)

def RELU(y):
    return np.maximum(0,y)
   

X1 =np.array([2,3])
w=np.array([0.5,1])
y=np.dot(X1,w)
z= RELU(y)
print(z)

